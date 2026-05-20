"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { API_BASE, apiHeaders, apiJsonHeaders, parseApiError, fetchConversationBillingTotals } from "@/lib/api";
import {
  chatPathConversation,
  chatPathNew,
  normalizePathname,
  parseChatPathname,
} from "@/lib/chatRoutes";

/** UI 门控：欢迎页/骨架/消息区；滚动与发送仍用 hasStarted */
export type ChatSurfacePhase = "authPending" | "newChat" | "hydrating" | "ready";
import {
  toolIoToPreview,
  groupMessagesIntoTraces,
  mapApiRowToMessage,
  sumThinkingDurations,
  lastAssistantFollowUpFromMessages,
} from "@/lib/chatUtils";
import { toast } from "sonner";
import { uploadOssChatImageWithProgress } from "@/lib/ossUpload";
import { CHAT_PENDING_ATTACHMENT_MAX, CHAT_IMAGE_MIN_EDGE_PX } from "@/lib/chatAttachmentConstants";
import { measureImageMinEdgePx, imageMinEdgeOkForChatVl } from "@/lib/chatImageDimensions";
import type {
  ChatMessage,
  Message,
  TraceMessage,
  WidgetMessage,
  ApiMessageRow,
  GenerationState,
  ServerConversation,
  ToolStep,
  ConversationFolder,
} from "@/types/chat";
import type { ChatModelCatalogResponse } from "@/types/models";
import { parseSseDataLine } from "@/lib/chat/sseParser";
import {
  PINNED_IDS_KEY,
  PENDING_CHAT_DRAFT_KEY,
  DEFAULT_AGENT_LS_KEY,
  CHAT_MODEL_LS_KEY,
  agentIdForChatRequest,
  applyFinalizeThinkingStepToMessages,
  delay,
  isLikelyUserAbort,
  normalizedUsageDelta,
  readStoredDefaultAgentId,
  resolveInitialPick,
  writeStoredPick,
} from "@/hooks/chat/chatHelpers";

export function useChat(opts: {
  autoFollowMainRef: React.MutableRefObject<boolean>;
  onNewChatScrollReset: () => void;
  /** 侧栏选中文件夹且将新建会话时，传入该分组 ID */
  getPreferredGroupForNewConversation?: () => string | null;
  /** 当前路径（如 `/chat`、`/chat/uuid`）；仅当为 `/chat` 时允许 localStorage 恢复到具体会话 */
  chatPathname?: string;
  /** `handleNewChat` 清空会话后导航到空白工作台 */
  onNavigateToNewChatSurface?: () => void;
}) {
  const {
    autoFollowMainRef,
    onNewChatScrollReset,
    getPreferredGroupForNewConversation,
    chatPathname = "",
    onNavigateToNewChatSurface,
  } = opts;
  const router = useRouter();
  const { token, loading: authLoading } = useAuth();

  const pendingChatModelRef = useRef<string | undefined>(undefined);
  const pendingNewConversationGroupRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const followUpsAbortRef = useRef<AbortController | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  /** SSE meta 刚写入 id 且路由尚未切到 `/chat/:id` 时为 true，避免 `/chat` 页误清空会话 */
  const [sseRouteAssignPending, setSseRouteAssignPending] = useState(false);
  const thinkingStepStartedAt = useRef<Record<string, number>>({});
  const traceStartedAt = useRef<Record<string, number>>({});

  const [messages, setMessages] = useState<Message[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [sessionRestorePending, setSessionRestorePending] = useState(false);
  const [genState, setGenState] = useState<GenerationState>("idle");
  const [conversationId, setConversationIdState] = useState<string | null>(null);
  const loadMessagesAbortRef = useRef<AbortController | null>(null);
  const loadMessagesGenRef = useRef(0);
  const initialListLoadedRef = useRef(false);
  /** 已加载过的会话消息，切换时先展示缓存避免清空闪屏 */
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());

  const setConversationId = useCallback((next: string | null) => {
    conversationIdRef.current = next;
    setConversationIdState(next);
  }, []);
  const [serverConversations, setServerConversations] = useState<ServerConversation[]>([]);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [movePendingId, setMovePendingId] = useState<string | null>(null);
  const [conversationFolders, setConversationFolders] = useState<ConversationFolder[]>([]);
  const [pinnedIds, setPinnedIdsState] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PINNED_IDS_KEY);
      if (!raw) return [];
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  });

  const [followUpSuggestions, setFollowUpSuggestions] = useState<{
    messageId: string;
    items: string[];
  } | null>(null);
  const [followUpsLoadingForId, setFollowUpsLoadingForId] = useState<string | null>(null);

  // ── Feature toggles (passed in from caller via setter pattern) ─────────────
  const [deepThinkEnabled, setDeepThinkEnabled] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchMode, setWebSearchMode] = useState<"force" | "auto">("force");

  const [modelCatalog, setModelCatalog] = useState<ChatModelCatalogResponse | null>(
    null,
  );
  const [selectedProviderId, setSelectedProviderIdState] = useState("");
  const [selectedChatModelId, setSelectedChatModelIdState] = useState("");

  /** 下一轮 SSE 使用的 Agent；null = omit（系统默认 / 会话回落） */
  const [chatAgentId, setChatAgentId] = useState<string | null>(() =>
    readStoredDefaultAgentId(),
  );

  /** 已上传待发送的图片 URL（OSS 签名） */
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);
  const [attachmentUploadBusy, setAttachmentUploadBusy] = useState(false);
  const [attachmentUploadSkeletonCount, setAttachmentUploadSkeletonCount] = useState(0);
  const [attachmentUploadSlotProgress, setAttachmentUploadSlotProgress] = useState<number[]>([]);

  /** 自最近一次发送起的 llm-usage 累计；新发送 / 新会话 / 切换会话时清零 */
  const [roundTokensUsage, setRoundTokensUsage] = useState<{
    prompt: number;
    completion: number;
    total: number;
  } | null>(null);

  /** 入库后的本会话累计（刷新页面后由接口恢复） */
  const [conversationUsageFromDb, setConversationUsageFromDb] = useState<{
    prompt: number;
    completion: number;
    total: number;
  } | null>(null);

  const attachmentUploadSlotProgressRef = useRef<number[]>([]);

  const cancelAttachmentUploadAnimations = useCallback(() => {
    attachmentUploadSlotProgressRef.current = [];
    setAttachmentUploadSlotProgress([]);
    setAttachmentUploadBusy(false);
    setAttachmentUploadSkeletonCount(0);
  }, []);

  const resetFollowUpSuggestions = useCallback(() => {
    followUpsAbortRef.current?.abort();
    followUpsAbortRef.current = null;
    setFollowUpSuggestions(null);
    setFollowUpsLoadingForId(null);
  }, []);

  /** 与 SSE 收尾共用：追问建议 POST */
  const enqueueFollowUpsRequest = useCallback(
    (targetId: string, assistantReplyAccum: string, userQuestion?: string) => {
      if (!token) return;
      const body = assistantReplyAccum.trim();
      const looksLikeHardError =
        body.startsWith("**Error:**") || body.startsWith("**网络错误");
      if (body.length < 12 || looksLikeHardError) return;

      followUpsAbortRef.current?.abort();
      const fa = new AbortController();
      followUpsAbortRef.current = fa;
      setFollowUpsLoadingForId(targetId);
      void (async () => {
        try {
          let anon: string | undefined;
          try {
            anon = localStorage.getItem("tcm_anon_secret") ?? undefined;
          } catch {
            anon = undefined;
          }
          const cid = conversationIdRef.current;
          const payload: Record<string, unknown> = {
            assistant_reply: body,
          };
          const uq = (userQuestion ?? "").trim();
          if (uq) {
            payload.user_question = uq;
          }
          if (cid) {
            payload.conversation_id = cid;
            if (anon) payload.anon_session_secret = anon;
            payload.assistant_message_id = targetId;
          }
          const r = await fetch(`${API_BASE}/api/chat/follow-up-suggestions`, {
            method: "POST",
            headers: apiJsonHeaders(token),
            body: JSON.stringify(payload),
            signal: fa.signal,
          });
          if (fa.signal.aborted) return;
          if (!r.ok) {
            if (process.env.NODE_ENV === "development") {
              console.warn(
                "[useChat] follow-up-suggestions:",
                r.status,
                await parseApiError(r)
              );
            }
            setFollowUpsLoadingForId((cur) => (cur === targetId ? null : cur));
            return;
          }
          const raw = (await r.json()) as { suggestions?: unknown };
          const items = Array.isArray(raw.suggestions)
            ? raw.suggestions.filter((x): x is string => typeof x === "string")
            : [];
          if (fa.signal.aborted) return;
          setFollowUpsLoadingForId((cur) => (cur === targetId ? null : cur));
          if (items.length > 0) {
            setFollowUpSuggestions({ messageId: targetId, items });
          }
        } catch (e) {
          if (fa.signal.aborted || isLikelyUserAbort(e, fa.signal)) return;
          if (process.env.NODE_ENV === "development") {
            console.warn("[useChat] follow-up-suggestions failed", e);
          }
          setFollowUpsLoadingForId((cur) => (cur === targetId ? null : cur));
        }
      })();
    },
    [token],
  );

  /** 附图 VL 快捷话术：POST 后端；仅返回后由输入栏展示，失败或空则不出条 */
  const fetchAiImageQuickPrompts = useCallback(
    async (
      imageUrls: string[],
      signal: AbortSignal,
    ): Promise<{ label: string; prompt: string }[] | null> => {
      if (authLoading || imageUrls.length === 0) return null;
      try {
        const payload: Record<string, unknown> = { image_urls: imageUrls };
        const cid = conversationIdRef.current;
        if (cid) {
          payload.conversation_id = cid;
          try {
            const anon = localStorage.getItem("tcm_anon_secret") ?? undefined;
            if (anon) payload.anon_session_secret = anon;
          } catch {
            /* ignore */
          }
        }
        const r = await fetch(`${API_BASE}/api/chat/attachment-suggestions`, {
          method: "POST",
          headers: apiJsonHeaders(token),
          body: JSON.stringify(payload),
          signal,
        });
        if (!r.ok) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              "[useChat] attachment-suggestions:",
              r.status,
              await parseApiError(r),
            );
          }
          return null;
        }
        const raw = (await r.json()) as {
          items?: unknown;
        };
        const rows = raw.items;
        if (!Array.isArray(rows)) return null;
        const out: { label: string; prompt: string }[] = [];
        for (const row of rows) {
          if (typeof row !== "object" || row === null) continue;
          const o = row as Record<string, unknown>;
          const label = typeof o.label === "string" ? o.label.trim() : "";
          const prompt = typeof o.prompt === "string" ? o.prompt.trim() : "";
          if (!label || !prompt) continue;
          out.push({ label, prompt });
          if (out.length >= 3) break;
        }
        return out.length > 0 ? out : null;
      } catch (e) {
        if (signal.aborted || isLikelyUserAbort(e, signal)) return null;
        if (process.env.NODE_ENV === "development") {
          console.warn("[useChat] attachment-suggestions failed", e);
        }
        return null;
      }
    },
    [authLoading, token],
  );

  const effectiveLlmPick = useMemo(() => {
    if (!modelCatalog?.providers?.length) return null;
    const pid =
      selectedProviderId.trim() || modelCatalog.default_llm_provider;
    const prov = modelCatalog.providers.find((x) => x.id === pid);
    if (!prov?.configured) return null;
    const mid =
      selectedChatModelId.trim() ||
      prov.models.find((m) => m.default)?.id ||
      prov.models[0]?.id ||
      "";
    if (!mid || !prov.models.some((m) => m.id === mid)) return null;
    return { llm_provider: prov.id, chat_model: mid };
  }, [modelCatalog, selectedProviderId, selectedChatModelId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/chat/model-options`);
        if (!r.ok) throw new Error(String(r.status));
        const raw = (await r.json()) as unknown;
        if (
          !raw ||
          typeof raw !== "object" ||
          !Array.isArray((raw as ChatModelCatalogResponse).providers)
        ) {
          throw new Error("invalid catalog shape");
        }
        const catalog = raw as ChatModelCatalogResponse;
        if (cancelled) return;
        setModelCatalog(catalog);
        const pick = resolveInitialPick(catalog);
        setSelectedProviderIdState(pick.providerId);
        setSelectedChatModelIdState(pick.modelId);
        if (pick.providerId && pick.modelId) {
          writeStoredPick({
            providerId: pick.providerId,
            modelId: pick.modelId,
          });
          try {
            localStorage.removeItem(CHAT_MODEL_LS_KEY);
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        console.warn(
          "[useChat] GET /api/chat/model-options 失败，不向请求写入 llm_provider/chat_model，由服务端默认兜底",
          e
        );
        if (!cancelled) {
          setModelCatalog(null);
          setSelectedProviderIdState("");
          setSelectedChatModelIdState("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const prov = modelCatalog?.providers.find((x) => x.id === selectedProviderId);
    const o = prov?.models.find((x) => x.id === selectedChatModelId);
    if (!o) return;
    const deepOk = o.capabilities?.supports_deep_think !== false;
    const toolOk = o.capabilities?.supports_tool_calling !== false;
    if (!deepOk) setDeepThinkEnabled(false);
    if (!toolOk) setWebSearchEnabled(false);
  }, [selectedProviderId, selectedChatModelId, modelCatalog]);

  const setModelPick = useCallback((providerId: string, modelId: string) => {
    const pid = providerId.trim();
    const mid = modelId.trim();
    setSelectedProviderIdState(pid);
    setSelectedChatModelIdState(mid);
    if (pid && mid) writeStoredPick({ providerId: pid, modelId: mid });
  }, []);

  // ── Computed ───────────────────────────────────────────────────────────────
  const lastAssistantMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "message" && m.role === "assistant") return m.id;
    }
    return null;
  }, [messages]);

  /** 输入区用量提示：生成中用 SSE「本轮」；空闲时优先本轮残留，否则用库内「本会话」累计 */
  const inputBarUsageHint = useMemo(() => {
    const round = roundTokensUsage && roundTokensUsage.total > 0 ? roundTokensUsage : null;
    const streaming = genState !== "idle";
    if (streaming) {
      return round ? { usage: round, variant: "round" as const } : null;
    }
    if (round) return { usage: round, variant: "round" as const };
    const db = conversationUsageFromDb;
    if (db && db.total > 0) return { usage: db, variant: "conversation" as const };
    return null;
  }, [genState, roundTokensUsage, conversationUsageFromDb]);

  // ── Server-side conversation list ──────────────────────────────────────────
  const refreshServerConversations = useCallback(async (): Promise<ServerConversation[] | null> => {
    if (!token) return null;
    const h = apiHeaders(token);
    try {
      const [cr, gr] = await Promise.all([
        fetch(`${API_BASE}/api/chat/conversations`, { headers: h }),
        fetch(`${API_BASE}/api/chat/groups`, { headers: h }),
      ]);
      let listOut: ServerConversation[] | null = null;
      if (cr.ok) {
        const data = (await cr.json()) as {
          id: string;
          title: string;
          created_at?: string;
          group_id?: string | null;
          agent_id?: string | null;
          agent_name?: string | null;
          last_model_name?: string | null;
        }[];
        if (Array.isArray(data)) {
          listOut = data.map((x) => ({
            id: x.id,
            title: x.title?.trim() || "未命名",
            created_at: x.created_at,
            group_id: x.group_id ?? null,
            agent_id: x.agent_id ?? null,
            agent_name: x.agent_name ?? null,
            last_model_name: x.last_model_name ?? null,
          }));
          setServerConversations(listOut);
        }
      }
      if (gr.ok) {
        const gd = (await gr.json()) as ConversationFolder[];
        if (Array.isArray(gd)) setConversationFolders(gd);
      }
      return listOut;
    } catch (err) {
      /** 后端未启动、离线、CORS 等：`fetch` 会抛 TypeError，避免未处理 rejection 和红栈 */
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[useChat] refreshServerConversations: 无法连接 API（请检查后端是否在本机端口运行，`NEXT_PUBLIC_API_BASE_URL` 是否正确）:",
          err
        );
      }
      return null;
    }
  }, [token]);

  const loadMessagesWithToken = useCallback(
    async (convId: string, accessToken: string, signal?: AbortSignal) => {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${convId}/messages`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = (await res.json()) as ApiMessageRow[];
      if (signal?.aborted) return;
      if (!Array.isArray(data)) return;
      const grouped = groupMessagesIntoTraces(data.map(mapApiRowToMessage));
      messagesCacheRef.current.set(convId, grouped);
      setMessages(grouped);
      const fu = lastAssistantFollowUpFromMessages(grouped);
      setFollowUpSuggestions(fu ? { messageId: fu.messageId, items: fu.items } : null);
    },
    []
  );

  useEffect(() => {
    const id = conversationId?.trim();
    if (!id || messages.length === 0) return;
    messagesCacheRef.current.set(id, messages);
  }, [conversationId, messages]);

  const refreshServerConversationsTracked = useCallback(async (): Promise<
    ServerConversation[] | null
  > => {
    const trackFirst = Boolean(token) && !initialListLoadedRef.current;
    if (trackFirst) setListLoading(true);
    try {
      return await refreshServerConversations();
    } finally {
      if (trackFirst) {
        initialListLoadedRef.current = true;
        setListLoading(false);
      }
    }
  }, [token, refreshServerConversations]);

  const urlConversationId = useMemo(() => {
    const parsed = parseChatPathname(chatPathname);
    return parsed.kind === "conversation" ? parsed.conversationId : null;
  }, [chatPathname]);

  const conversationRouteSynced = useMemo(
    () => !urlConversationId || conversationId === urlConversationId,
    [urlConversationId, conversationId]
  );

  const chatSurfacePhase = useMemo((): ChatSurfacePhase => {
    if (authLoading || sessionRestorePending) return "authPending";

    const parsed = parseChatPathname(chatPathname);

    if (sseRouteAssignPending) return "hydrating";

    if (parsed.kind === "conversation") {
      if (!token) return "authPending";
      if (conversationId !== parsed.conversationId || messagesLoading) return "hydrating";
      return "ready";
    }

    if (!token) {
      if (parsed.kind === "new" && !hasStarted) return "newChat";
      return "ready";
    }

    if (parsed.kind === "new") {
      if (!hasStarted) return "newChat";
      return "ready";
    }

    return "ready";
  }, [
    authLoading,
    sessionRestorePending,
    chatPathname,
    sseRouteAssignPending,
    token,
    conversationId,
    messagesLoading,
    hasStarted,
  ]);

  const refreshConversationBillingTotals = useCallback(async (cid: string | null) => {
    if (!token || !cid?.trim()) {
      setConversationUsageFromDb(null);
      return;
    }
    try {
      const data = await fetchConversationBillingTotals(token, cid.trim());
      setConversationUsageFromDb({
        prompt: data.totals.prompt_tokens,
        completion: data.totals.completion_tokens,
        total: data.totals.total_tokens,
      });
    } catch {
      setConversationUsageFromDb(null);
    }
  }, [token]);

  // ── Thinking / trace finalization ──────────────────────────────────────────
  const finalizeThinkingStep = useCallback((traceId: string | null, stepId: string | null) => {
    if (!traceId || !stepId) return;
    if (thinkingStepStartedAt.current[stepId] == null) return;
    setMessages((prev) =>
      applyFinalizeThinkingStepToMessages(prev, traceId, stepId, thinkingStepStartedAt.current)
    );
  }, []);

  const finalizeTrace = useCallback((traceId: string | null, collapsed: boolean) => {
    if (!traceId) return;
    const start = traceStartedAt.current[traceId];
    const elapsedSec = start != null ? Math.max(0, (Date.now() - start) / 1000) : undefined;
    delete traceStartedAt.current[traceId];
    setMessages((prev) =>
      prev.map((m) =>
        m.type === "trace" && m.id === traceId
          ? {
              ...m,
              status: "done",
              collapsed,
              totalDurationSec:
                elapsedSec ?? m.totalDurationSec ?? sumThinkingDurations(m.steps),
            }
          : m
      )
    );
  }, []);

  // ── SSE streaming ──────────────────────────────────────────────────────────
  const runChatStream = useCallback(
    async (
      userText: string,
      appendUserMessage: boolean,
      streamOpts?: { regenerateLastReply?: boolean; imageUrls?: string[] }
    ) => {
      if (!token) return;

      resetFollowUpSuggestions();
      setRoundTokensUsage(null);

      pendingChatModelRef.current = undefined;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (appendUserMessage) {
        const userMsgId = Date.now().toString();
        const imgs = streamOpts?.imageUrls?.filter((u) => u.trim()) ?? [];
        setMessages((prev) => [
          ...prev,
          {
            id: userMsgId,
            role: "user",
            type: "message",
            content: userText,
            ...(imgs.length ? { imageUrls: imgs } : {}),
          },
        ]);
      }

      if (!conversationId) setIsGeneratingTitle(true);
      setGenState("waiting");

      const startTime = Date.now();
      let currentAssistantMsgId = Date.now().toString() + "-msg";
      let currentTraceId: string | null = null;
      let openThinkingStepId: string | null = null;
      let hasAssistantMsg = false;
      let streamEndedWithSSEError = false;
      let streamEndedWithWidget = false;
      let assistantReplyAccum = "";

      try {
        const preferredGid =
          !conversationId ? getPreferredGroupForNewConversation?.() ?? null : null;
        pendingNewConversationGroupRef.current = preferredGid;
        const response = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            message: userText,
            conversation_id: conversationIdRef.current ?? conversationId,
            regenerate_last_reply: streamOpts?.regenerateLastReply ?? false,
            ...(agentIdForChatRequest(chatAgentId)
              ? { agent_id: agentIdForChatRequest(chatAgentId) }
              : {}),
            deep_think: deepThinkEnabled,
            web_search_enabled: webSearchEnabled,
            web_search_mode: webSearchMode,
            ...(effectiveLlmPick
              ? {
                  llm_provider: effectiveLlmPick.llm_provider,
                  chat_model: effectiveLlmPick.chat_model,
                }
              : {}),
            ...(streamOpts?.imageUrls?.length
              ? { image_urls: streamOpts.imageUrls }
              : {}),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        // 强制让星星至少旋转 600ms，保证视觉上的"思考前摇"
        const elapsed = Date.now() - startTime;
        if (elapsed < 600) await delay(600 - elapsed);

        const reader = response.body?.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        if (!reader) return;

        const ensureFreshTraceBeforeToolOrThink = (prev: Message[], base: string | null) => {
          if (!base) {
            currentTraceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            traceStartedAt.current[currentTraceId] = Date.now();
            return currentTraceId;
          }
          const rw = prev.find(
            (m): m is TraceMessage => m.type === "trace" && m.id === base
          );
          if (hasAssistantMsg && rw?.status === "done") {
            currentTraceId = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            traceStartedAt.current[currentTraceId] = Date.now();
            return currentTraceId;
          }
          currentTraceId = base;
          return base;
        };

        const continuationAssistantBubble = (): ChatMessage => ({
          id: `${Date.now().toString()}-msg-${Math.random().toString(36).slice(2, 9)}`,
          role: "assistant",
          type: "message",
          content: "",
          modelName: pendingChatModelRef.current,
        });

        /** 按 SSE 时间在「已到手的正文 ↔ 占位接续气泡」之间插入新头脑风暴块 */
        const insertNewStreamingTrace = (
          prev: Message[],
          traceMsg: TraceMessage,
        ): Message[] => {
          if (!hasAssistantMsg) return [...prev, traceMsg];

          const emptyPhIdx = prev.findLastIndex(
            (m): m is ChatMessage =>
              m.type === "message" &&
              m.role === "assistant" &&
              m.id === currentAssistantMsgId &&
              !(m.content || "").trim(),
          );
          let lastTraceBeforePlaceholder = -1;
          if (emptyPhIdx !== -1) {
            for (let i = 0; i < emptyPhIdx; i++) {
              if (prev[i].type === "trace") lastTraceBeforePlaceholder = i;
            }
          }
          if (
            emptyPhIdx !== -1 &&
            lastTraceBeforePlaceholder !== -1 &&
            lastTraceBeforePlaceholder < emptyPhIdx
          ) {
            return [
              ...prev.slice(0, lastTraceBeforePlaceholder + 1),
              traceMsg,
              ...prev.slice(lastTraceBeforePlaceholder + 1),
            ];
          }

          const nonemptyAsIdx = prev.findLastIndex(
            (m): m is ChatMessage =>
              m.type === "message" &&
              m.role === "assistant" &&
              !!(m.content || "").trim(),
          );
          if (nonemptyAsIdx !== -1) {
            const cont = continuationAssistantBubble();
            currentAssistantMsgId = cont.id;
            return [
              ...prev.slice(0, nonemptyAsIdx + 1),
              traceMsg,
              cont,
              ...prev.slice(nonemptyAsIdx + 1),
            ];
          }

          return [...prev, traceMsg];
        };

        while (true) {
          if (abortController.signal.aborted) break;
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6);
            const parsedLine = parseSseDataLine(dataStr);
            if (parsedLine.kind === "done") continue;
            if (parsedLine.kind !== "json") continue;

            try {
              const data = parsedLine.data;
              const sseStr = (v: unknown): string =>
                typeof v === "string" ? v : "";

              if (data.type === "meta") {
                const convId =
                  typeof data.conversationId === "string"
                    ? data.conversationId
                    : "";
                if (convId) {
                  setSseRouteAssignPending(true);
                  router.replace(chatPathConversation(convId));
                  setConversationId(convId);
                  localStorage.setItem("tcm_conversation_id", convId);
                  setServerConversations((prev) => {
                    if (prev.some((c) => c.id === convId)) return prev;
                    return [
                      {
                        id: convId,
                        title: "",
                        created_at: new Date().toISOString(),
                        group_id: pendingNewConversationGroupRef.current,
                      },
                      ...prev,
                    ];
                  });
                }
                if (typeof data.chatModel === "string" && data.chatModel.trim() !== "") {
                  pendingChatModelRef.current = data.chatModel.trim();
                }
              } else if (data.type === "thinking-delta") {
                const piece =
                  typeof data.textDelta === "string" ? data.textDelta : "";
                if (openThinkingStepId === null) {
                  const nid = `think-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                  openThinkingStepId = nid;
                  thinkingStepStartedAt.current[nid] = Date.now();
                  setGenState("thinking");
                  setMessages((prev) => {
                    const traceIdResolved = ensureFreshTraceBeforeToolOrThink(prev, currentTraceId);
                    const trace = prev.find(
                      (msg): msg is TraceMessage =>
                        msg.type === "trace" && msg.id === traceIdResolved
                    );
                    if (!trace) {
                      return insertNewStreamingTrace(prev, {
                        id: traceIdResolved,
                        type: "trace",
                        steps: [{ id: nid, type: "thinking", content: piece }],
                        status: "streaming",
                        totalDurationSec: undefined,
                        collapsed: false,
                      });
                    }
                    return prev.map((msg) =>
                      msg.type === "trace" && msg.id === traceIdResolved
                        ? {
                            ...msg,
                            status: "streaming",
                            steps: [...msg.steps, { id: nid, type: "thinking", content: piece }],
                          }
                        : msg
                    );
                  });
                } else {
                  setGenState("thinking");
                  const tid = openThinkingStepId;
                  setMessages((prev) => {
                    const traceIdResolved = ensureFreshTraceBeforeToolOrThink(prev, currentTraceId);
                    return prev.map((msg) =>
                      msg.type === "trace" && msg.id === traceIdResolved
                        ? {
                            ...msg,
                            steps: msg.steps.map((step) =>
                              step.type === "thinking" && step.id === tid
                                ? { ...step, content: step.content + piece }
                                : step
                            ),
                          }
                        : msg
                    );
                  });
                }
              } else if (data.type === "tool-call") {
                const stepSnap = openThinkingStepId;
                openThinkingStepId = null;
                const runKey =
                  sseStr(data.runId) ||
                  `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const rowId = `tool-${runKey}`;
                setGenState("tool");
                setMessages((prev) => {
                  const traceIdResolved = ensureFreshTraceBeforeToolOrThink(prev, currentTraceId);
                  let base = prev;
                  if (stepSnap) {
                    base = applyFinalizeThinkingStepToMessages(
                      prev,
                      traceIdResolved,
                      stepSnap,
                      thinkingStepStartedAt.current,
                    );
                  }
                  const toolStep: ToolStep = {
                    id: rowId,
                    type: "tool",
                    toolName: sseStr(data.name) || "tool",
                    status: "running",
                    runId: sseStr(data.runId) || runKey,
                    inputPreview: toolIoToPreview((data as { input?: unknown }).input),
                  };
                  const trace = base.find(
                    (msg): msg is TraceMessage => msg.type === "trace" && msg.id === traceIdResolved
                  );
                  if (!trace) {
                    return insertNewStreamingTrace(base, {
                      id: traceIdResolved,
                      type: "trace",
                      steps: [toolStep],
                      status: "streaming",
                      totalDurationSec: undefined,
                      collapsed: false,
                    });
                  }
                  return base.map((msg) =>
                    msg.type === "trace" && msg.id === traceIdResolved
                      ? { ...msg, status: "streaming", steps: [...msg.steps, toolStep] }
                      : msg
                  );
                });
              } else if (data.type === "tool-result") {
                openThinkingStepId = null;
                const rid = sseStr(data.runId) || undefined;
                const outputPreviewFromEvent =
                  typeof data.outputPreview === "string" && data.outputPreview
                    ? data.outputPreview
                    : undefined;
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.type !== "trace" || msg.id !== currentTraceId) return msg;
                    let idx = -1;
                    if (rid != null) {
                      idx = msg.steps.findIndex(
                        (step) =>
                          step.type === "tool" && step.status === "running" && step.runId === rid
                      );
                    }
                    if (idx === -1) {
                      idx = msg.steps.findIndex(
                        (step) => step.type === "tool" && step.status === "running"
                      );
                    }
                    if (idx === -1) return msg;
                    const nextStatus =
                      (data.status as string | undefined) === "error" ? "error" : "success";
                    return {
                      ...msg,
                      steps: msg.steps.map((step, i) =>
                        i === idx && step.type === "tool"
                          ? {
                              ...step,
                              status: nextStatus,
                              outputPreview: outputPreviewFromEvent ?? step.outputPreview,
                            }
                          : step
                      ),
                    };
                  })
                );
              } else if (data.type === "text-delta") {
                finalizeThinkingStep(currentTraceId, openThinkingStepId);
                openThinkingStepId = null;
                if (currentTraceId) {
                  finalizeTrace(currentTraceId, true);
                  currentTraceId = null;
                  // 从头脑风暴切到正文时布局剧变，避免 scrollTop 钳位被误判为上滑而停止跟滚
                  autoFollowMainRef.current = true;
                }
                const piece =
                  typeof data.textDelta === "string" ? data.textDelta : "";
                assistantReplyAccum += piece;
                if (!hasAssistantMsg) {
                  hasAssistantMsg = true;
                  setGenState("typing");
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: currentAssistantMsgId,
                      role: "assistant",
                      type: "message",
                      content: piece,
                      modelName: pendingChatModelRef.current,
                    },
                  ]);
                } else {
                  setGenState("typing");
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.type === "message" && msg.id === currentAssistantMsgId
                        ? { ...msg, content: (msg.content || "") + piece }
                        : msg
                    )
                  );
                }
              } else if (data.type === "widget") {
                const widgetMsg: WidgetMessage = {
                  id: String(data.widgetId || `w-${Date.now()}`),
                  type: "widget",
                  widgetType: "choice",
                  question: String(data.question || ""),
                  choices: Array.isArray(data.choices) ? data.choices.map(String) : [],
                  allowFreeText: data.allowFreeText !== false,
                };
                streamEndedWithWidget = true;
                setMessages((prev) => {
                  // 移除 insertNewStreamingTrace 在工具调用后插入的空 continuation 气泡，
                  // 避免空气泡携带 toolbar 和 follow-up 建议显示在 widget 前面
                  const cleaned = prev.filter(
                    (m) =>
                      !(
                        m.type === "message" &&
                        m.role === "assistant" &&
                        m.id === currentAssistantMsgId &&
                        !(m.content || "").trim()
                      ),
                  );
                  return [...cleaned, widgetMsg];
                });
              } else if (data.type === "title-updated") {
                const cid =
                  typeof data.conversationId === "string" ? data.conversationId : null;
                const newTitle = typeof data.title === "string" ? data.title.trim() : "";
                // 必须用 SSE 里的 conversationId：新建会话时闭包里的 conversationId 仍为 null
                if (cid) {
                  const nextTitle = newTitle || "新会话";
                  setServerConversations((prev) => {
                    const idx = prev.findIndex((c) => c.id === cid);
                    if (idx === -1) {
                      return [
                        {
                          id: cid,
                          title: nextTitle,
                          created_at: new Date().toISOString(),
                          group_id: pendingNewConversationGroupRef.current,
                        },
                        ...prev,
                      ];
                    }
                    return prev.map((c) => (c.id === cid ? { ...c, title: nextTitle } : c));
                  });
                }
                setIsGeneratingTitle(false);
              } else if (data.type === "llm-usage") {
                const add = normalizedUsageDelta(data.usage);
                const deltaTotal =
                  add.total > 0 ? add.total : add.prompt + add.completion;
                if (deltaTotal <= 0 && add.prompt <= 0 && add.completion <= 0) {
                  /* skip empty */
                } else {
                  setRoundTokensUsage((prev) => ({
                    prompt: (prev?.prompt ?? 0) + add.prompt,
                    completion: (prev?.completion ?? 0) + add.completion,
                    total: (prev?.total ?? 0) + deltaTotal,
                  }));
                }
              } else if (data.type === "error") {
                streamEndedWithSSEError = true;
                console.error("Backend error:", data.message);
                finalizeThinkingStep(currentTraceId, openThinkingStepId);
                openThinkingStepId = null;
                if (currentTraceId) {
                  finalizeTrace(currentTraceId, false);
                  currentTraceId = null;
                }
                const errLine = `**Error:** ${data.message}`;
                setMessages((prev) => {
                  let lastAiIdx = -1;
                  for (let i = prev.length - 1; i >= 0; i--) {
                    const row = prev[i];
                    if (row.type === "message" && row.role === "assistant") {
                      lastAiIdx = i;
                      break;
                    }
                  }
                  if (lastAiIdx !== -1) {
                    const row = prev[lastAiIdx] as ChatMessage;
                    const prefix = (row.content || "").trim();
                    const nextContent = prefix ? `${prefix}\n\n${errLine}` : errLine;
                    return prev.map((x, i) =>
                      i === lastAiIdx && x.type === "message"
                        ? { ...(x as ChatMessage), content: nextContent }
                        : x
                    );
                  }
                  return [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      role: "assistant",
                      type: "message",
                      content: errLine,
                    },
                  ];
                });
              }
            } catch (e) {
              console.error("Error parsing SSE data", e);
            }
          }
        }

        finalizeThinkingStep(currentTraceId, openThinkingStepId);
        if (currentTraceId) finalizeTrace(currentTraceId, false);

        if (
          !abortController.signal.aborted &&
          !streamEndedWithSSEError &&
          !streamEndedWithWidget &&
          hasAssistantMsg &&
          token
        ) {
          const body = assistantReplyAccum.trim();
          const looksLikeHardError =
            body.startsWith("**Error:**") || body.startsWith("**网络错误");
          if (body.length >= 12 && !looksLikeHardError) {
            enqueueFollowUpsRequest(currentAssistantMsgId, body, userText);
          }
        }

        await refreshServerConversations();
        if (!abortController.signal.aborted) {
          setGenState("idle");
        }
      } catch (error) {
        // 真实网络/解析错误（用户主动中止在 finally 中收口，避免出现「伪网络错误」气泡）
        if (!isLikelyUserAbort(error, abortController.signal)) {
          console.error("Chat error:", error);
          finalizeThinkingStep(currentTraceId, openThinkingStepId);
          if (currentTraceId) finalizeTrace(currentTraceId, false);
          thinkingStepStartedAt.current = {};
          traceStartedAt.current = {};
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: "assistant",
              type: "message",
              content: "**网络错误**：无法连接到服务器，请确保后端服务已启动。",
            },
          ]);
          setGenState("idle");
        }
      } finally {
        if (abortController.signal.aborted) {
          finalizeThinkingStep(currentTraceId, openThinkingStepId);
          if (currentTraceId) finalizeTrace(currentTraceId, false);
          setMessages((prev) => {
            const lastAi = [...prev]
              .reverse()
              .find((m): m is ChatMessage => m.type === "message" && m.role === "assistant");
            if (lastAi) {
              if (lastAi.interrupted) return prev;
              return prev.map((m) =>
                m.id === lastAi.id && m.type === "message" && m.role === "assistant"
                  ? { ...m, interrupted: true }
                  : m
              );
            }
            const tail = prev[prev.length - 1];
            if (
              tail &&
              tail.type === "message" &&
              tail.role === "assistant" &&
              tail.interrupted &&
              !(tail.content || "").trim()
            ) {
              return prev;
            }
            return [
              ...prev,
              {
                id: `${Date.now()}-interrupted`,
                role: "assistant",
                type: "message",
                content: "",
                interrupted: true,
              },
            ];
          });
          setGenState("idle");
        }
        const cidFin = conversationIdRef.current;
        if (token && cidFin) {
          void refreshConversationBillingTotals(cidFin);
        }
        abortControllerRef.current = null;
        setIsGeneratingTitle(false);
      }
    },
    [
      token,
      conversationId,
      deepThinkEnabled,
      webSearchEnabled,
      webSearchMode,
      effectiveLlmPick,
      autoFollowMainRef,
      finalizeThinkingStep,
      finalizeTrace,
      refreshServerConversations,
      getPreferredGroupForNewConversation,
      resetFollowUpSuggestions,
      enqueueFollowUpsRequest,
      refreshConversationBillingTotals,
      router,
      chatAgentId,
    ]
  );

  // ── Public handlers ────────────────────────────────────────────────────────
  /** 用户回答 widget 选择框后调用：标记 widget 已作答并发送答案 */
  const handleWidgetAnswer = useCallback(
    (widgetId: string, answer: string | null) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.type === "widget" && m.id === widgetId
            ? { ...m, answer: answer ?? undefined, dismissed: answer === null }
            : m
        )
      );
      if (answer !== null) {
        setHasStarted(true);
        autoFollowMainRef.current = true;
        // appendUserMessage=false：答案已显示在 widget 紧凑状态，不再额外显示用户气泡
        runChatStream(answer, false, {});
      }
    },
    [autoFollowMainRef, runChatStream]
  );

  const handleSend = useCallback(
    async (input: string, setInput: (v: string) => void) => {
      if ((!input.trim() && pendingImageUrls.length === 0) || genState !== "idle") return;
      if (authLoading) return;
      if (!token) {
        try {
          sessionStorage.setItem(PENDING_CHAT_DRAFT_KEY, input);
        } catch {
          /* ignore */
        }
        router.push("/login");
        return;
      }
      const urlsSnap = [...pendingImageUrls];
      const trimmed = input.trim();
      const userText = trimmed || (urlsSnap.length > 0 ? "（附图）" : "");
      setInput("");
      setPendingImageUrls([]);
      setHasStarted(true);
      autoFollowMainRef.current = true;
      try {
        await runChatStream(userText, true, {
          ...(urlsSnap.length ? { imageUrls: urlsSnap } : {}),
        });
      } catch {
        setPendingImageUrls(urlsSnap);
        setInput(trimmed);
      }
    },
    [
      pendingImageUrls,
      genState,
      authLoading,
      token,
      router,
      autoFollowMainRef,
      runChatStream,
    ]
  );

  const pushImageAttachments = useCallback(
    async (fileList: FileList | readonly File[] | null) => {
      const files = fileList == null ? [] : Array.from(fileList);
      if (files.length === 0) return;
      if (!token) {
        router.push("/login");
        return;
      }
      const bad = files.find((f) => !f.type.startsWith("image/"));
      if (bad != null || files.length === 0) {
        toast.error("请选择图片格式（JPEG/PNG/WebP/GIF）");
        return;
      }
      const room = CHAT_PENDING_ATTACHMENT_MAX - pendingImageUrls.length;
      if (room <= 0) {
        toast.error(`最多可同时添加 ${CHAT_PENDING_ATTACHMENT_MAX} 个附件`);
        return;
      }
      if (files.length > room) {
        toast.error(
          `最多 ${CHAT_PENDING_ATTACHMENT_MAX} 个，当前还可再选 ${room} 张`
        );
        return;
      }

      setAttachmentUploadBusy(true);
      try {
        const measured = await Promise.all(
          files.map(async (file) => ({
            file,
            minEdge: await measureImageMinEdgePx(file),
          }))
        );

        const skippedTooSmall = measured.filter(
          (x) => !imageMinEdgeOkForChatVl(x.minEdge)
        ).length;

        const toUpload = measured
          .filter((x) => imageMinEdgeOkForChatVl(x.minEdge))
          .map((x) => x.file);

        if (toUpload.length === 0) {
          toast.error(
            skippedTooSmall === files.length
              ? `所选图片均小于 ${CHAT_IMAGE_MIN_EDGE_PX}×${CHAT_IMAGE_MIN_EDGE_PX} 像素（多模态要求宽、高均须大于 10px），已全部跳过。`
              : "没有可上传的图片。"
          );
          return;
        }

        const m = toUpload.length;
        const zeros = Array<number>(m).fill(0);
        attachmentUploadSlotProgressRef.current = zeros.slice();
        setAttachmentUploadSlotProgress(zeros);
        setAttachmentUploadSkeletonCount(m);

        const settled = await Promise.allSettled(
          toUpload.map((file, i) =>
            uploadOssChatImageWithProgress(token, file, (frac) => {
              const buf = attachmentUploadSlotProgressRef.current;
              if (buf.length !== m) return;
              buf[i] = frac;
              setAttachmentUploadSlotProgress((prev) => {
                if (prev.length !== m) return prev;
                const next = prev.slice();
                next[i] = frac;
                return next;
              });
            })
          )
        );

        const okUrls: string[] = [];
        const failedLines: string[] = [];
        for (let i = 0; i < settled.length; i++) {
          const r = settled[i];
          if (r.status === "fulfilled") {
            okUrls.push(r.value);
            continue;
          }
          const name = toUpload[i]?.name?.trim();
          const reason =
            r.reason instanceof Error && r.reason.message
              ? r.reason.message
              : "上传失败";
          failedLines.push(name ? `「${name}」${reason}` : reason);
        }

        if (okUrls.length > 0) {
          setPendingImageUrls((prev) => [...prev, ...okUrls]);
        }

        const hintParts: string[] = [];
        if (skippedTooSmall > 0) {
          hintParts.push(
            `已自动跳过 ${skippedTooSmall} 张尺寸过小（每张宽、高须≥${CHAT_IMAGE_MIN_EDGE_PX}px）的图片`
          );
        }
        if (failedLines.length > 0) {
          hintParts.push(
            failedLines.length === 1
              ? failedLines[0]!
              : `${failedLines.length} 张未上传成功（${failedLines[0]} 等）`
          );
        }
        if (hintParts.length > 0) {
          const text = hintParts.join("；");
          if (okUrls.length > 0) {
            toast.warning(text, { duration: 5200 });
          } else {
            toast.error(text, { duration: 6200 });
          }
        }
      } catch (err) {
        const msg =
          err instanceof Error && err.message
            ? err.message
            : "图片上传失败，请检查 OSS 配置与登录状态";
        toast.error(msg, { duration: 5200 });
      } finally {
        cancelAttachmentUploadAnimations();
      }
    },
    [
      token,
      router,
      pendingImageUrls.length,
      cancelAttachmentUploadAnimations,
    ]
  );

  const removePendingImageUrlAt = useCallback((index: number) => {
    setPendingImageUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  /** 从历史用户气泡恢复待发送图片（点击铅笔编辑时） */
  const applyComposerAttachmentsFromUserMessage = useCallback(
    (imageUrls?: string[]) => {
      cancelAttachmentUploadAnimations();
      const cleaned = (imageUrls ?? []).map((u) => u.trim()).filter(Boolean);
      const deduped = [...new Set(cleaned)];
      setPendingImageUrls(deduped.slice(0, CHAT_PENDING_ATTACHMENT_MAX));
    },
    [cancelAttachmentUploadAnimations],
  );

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleRegenerateAssistant = useCallback(
    (assistantMsgId: string) => {
      if (genState !== "idle" || !token) return;
      const idx = messages.findIndex((m) => m.id === assistantMsgId);
      if (idx <= 0) return;
      let userIdx = -1;
      let userText: string | null = null;
      let regenerateImageUrls: string[] | undefined;
      for (let i = idx - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.type !== "message" || m.role !== "user") continue;
        const um = m as ChatMessage;
        const hasTxt = !!(um.content || "").trim();
        const hasPic = (um.imageUrls?.length ?? 0) > 0;
        if (!hasTxt && !hasPic) continue;
        userText = hasTxt ? um.content.trim() : "（附图）";
        const raw = (um.imageUrls ?? []).map((u) => u.trim()).filter(Boolean);
        regenerateImageUrls = raw.length ? raw : undefined;
        userIdx = i;
        break;
      }
      if (!userText || userIdx < 0) return;
      setMessages((prev) => {
        const removed = prev.slice(userIdx + 1);
        for (const m of removed) {
          if (m.type === "trace") {
            delete traceStartedAt.current[m.id];
            for (const step of m.steps) {
              if (step.type === "thinking") delete thinkingStepStartedAt.current[step.id];
            }
          }
        }
        return prev.slice(0, userIdx + 1);
      });
      void runChatStream(userText, false, {
        regenerateLastReply: true,
        ...(regenerateImageUrls?.length ? { imageUrls: regenerateImageUrls } : {}),
      });
    },
    [genState, token, messages, runChatStream]
  );

  const handleNewChat = useCallback(
    (options?: { skipNavigation?: boolean }) => {
      loadMessagesAbortRef.current?.abort();
      loadMessagesAbortRef.current = null;
      setMessagesLoading(false);
      setSseRouteAssignPending(false);
      resetFollowUpSuggestions();
      localStorage.removeItem("tcm_conversation_id");
      localStorage.removeItem("tcm_anon_secret");
      setConversationId(null);
      setMessages([]);
      onNewChatScrollReset();
      thinkingStepStartedAt.current = {};
      traceStartedAt.current = {};
      setRoundTokensUsage(null);
      setConversationUsageFromDb(null);
      setHasStarted(false);
      setGenState("idle");
      setIsGeneratingTitle(false);
      setPendingImageUrls([]);
      cancelAttachmentUploadAnimations();
      setChatAgentId(readStoredDefaultAgentId());
      if (token) void refreshServerConversations();
      if (!options?.skipNavigation) onNavigateToNewChatSurface?.();
    },
    [
      token,
      refreshServerConversations,
      onNewChatScrollReset,
      cancelAttachmentUploadAnimations,
      resetFollowUpSuggestions,
      onNavigateToNewChatSurface,
    ]
  );

  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (genState !== "idle" || !token) return;
      const idTrim = id.trim();
      if (!idTrim) return;
      if (
        idTrim === conversationId &&
        !messagesLoading &&
        (messages.length > 0 || messagesCacheRef.current.has(idTrim))
      ) {
        return;
      }

      loadMessagesAbortRef.current?.abort();
      const ac = new AbortController();
      loadMessagesAbortRef.current = ac;
      const loadGen = ++loadMessagesGenRef.current;

      resetFollowUpSuggestions();
      setIsGeneratingTitle(false);
      setConversationUsageFromDb(null);
      setRoundTokensUsage(null);
      onNewChatScrollReset();
      setConversationId(idTrim);
      localStorage.setItem("tcm_conversation_id", idTrim);
      setHasStarted(true);

      const cached = messagesCacheRef.current.get(idTrim);
      if (cached?.length) {
        setMessages(cached);
        const fu = lastAssistantFollowUpFromMessages(cached);
        setFollowUpSuggestions(fu ? { messageId: fu.messageId, items: fu.items } : null);
      } else if (idTrim !== conversationId) {
        setMessages([]);
        setFollowUpSuggestions(null);
      }

      setMessagesLoading(true);

      try {
        const [, mapped] = await Promise.all([
          loadMessagesWithToken(idTrim, token, ac.signal).catch((e) => {
            if (ac.signal.aborted) return;
            console.error(e);
            toast.error("加载对话失败，请稍后重试");
          }),
          refreshServerConversations(),
          refreshConversationBillingTotals(idTrim),
        ]);
        if (!ac.signal.aborted && mapped) {
          const row = mapped.find((c) => c.id === idTrim);
          const aid = row?.agent_id?.trim();
          setChatAgentId(aid || null);
        }
      } catch (e) {
        if (!ac.signal.aborted) console.error(e);
      } finally {
        if (loadMessagesGenRef.current === loadGen) {
          setMessagesLoading(false);
        }
      }
    },
    [
      genState,
      token,
      conversationId,
      messages.length,
      messagesLoading,
      loadMessagesWithToken,
      onNewChatScrollReset,
      resetFollowUpSuggestions,
      refreshConversationBillingTotals,
      refreshServerConversations,
      setConversationId,
    ]
  );

  const openDeleteDialog = useCallback(
    (id: string) => {
      if (!token) return;
      setDeleteTargetId(id);
    },
    [token]
  );

  const closeDeleteDialog = useCallback(() => {
    if (deletePending) return;
    setDeleteTargetId(null);
  }, [deletePending]);

  const confirmDeleteConversation = useCallback(async () => {
    if (!token || !deleteTargetId) return;
    const id = deleteTargetId;
    setDeletePending(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete conversation");
      setServerConversations((prev) => prev.filter((c) => c.id !== id));
      setPinnedIdsState((prev) => {
        const next = prev.filter((x) => x !== id);
        try {
          localStorage.setItem(PINNED_IDS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
      if (conversationId === id) handleNewChat();
      messagesCacheRef.current.delete(id);
      setDeleteTargetId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setDeletePending(false);
    }
  }, [token, deleteTargetId, conversationId, handleNewChat]);

  const moveConversationToGroup = useCallback(
    async (convId: string, groupId: string | null) => {
      if (!token) return;
      setMovePendingId(convId);
      try {
        const res = await fetch(`${API_BASE}/api/chat/conversations/${convId}/group`, {
          method: "PUT",
          headers: apiJsonHeaders(token),
          body: JSON.stringify({ group_id: groupId }),
        });
        if (!res.ok) return;
        setServerConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, group_id: groupId } : c))
        );
        await refreshServerConversations();
      } finally {
        setMovePendingId(null);
      }
    },
    [token, refreshServerConversations]
  );

  const createFolder = useCallback(
    async (name: string) => {
      if (!token?.trim()) return null;
      const res = await fetch(`${API_BASE}/api/chat/groups`, {
        method: "POST",
        headers: apiJsonHeaders(token),
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) return null;
      const row = (await res.json()) as ConversationFolder;
      await refreshServerConversations();
      return row;
    },
    [token, refreshServerConversations]
  );

  const renameFolder = useCallback(
    async (groupId: string, name: string) => {
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/chat/groups/${groupId}`, {
        method: "PATCH",
        headers: apiJsonHeaders(token),
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) await refreshServerConversations();
    },
    [token, refreshServerConversations]
  );

  const deleteFolder = useCallback(
    async (groupId: string) => {
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/chat/groups/${groupId}`, {
        method: "DELETE",
        headers: apiHeaders(token),
      });
      if (res.ok) await refreshServerConversations();
    },
    [token, refreshServerConversations]
  );

  const togglePinConversation = useCallback((id: string) => {
    setPinnedIdsState((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [id, ...prev.filter((x) => x !== id)];
      try {
        localStorage.setItem(PINNED_IDS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const deleteConversationsBulk = useCallback(
    async (ids: string[]) => {
      if (!token || ids.length === 0) return;
      setBulkDeletePending(true);
      try {
        const h = apiHeaders(token);
        for (const id of ids) {
          await fetch(`${API_BASE}/api/chat/conversations/${id}`, {
            method: "DELETE",
            headers: h,
          });
        }
        setServerConversations((prev) => prev.filter((c) => !ids.includes(c.id)));
        setPinnedIdsState((prev) => {
          const next = prev.filter((x) => !ids.includes(x));
          try {
            localStorage.setItem(PINNED_IDS_KEY, JSON.stringify(next));
          } catch {
            /* ignore */
          }
          return next;
        });
        if (conversationId && ids.includes(conversationId)) handleNewChat();
      } catch (e) {
        console.error(e);
      } finally {
        setBulkDeletePending(false);
      }
    },
    [token, conversationId, handleNewChat]
  );

  // ── Auth effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    const p = parseChatPathname(chatPathname);
    if (
      p.kind === "conversation" &&
      conversationId &&
      p.conversationId === conversationId
    ) {
      setSseRouteAssignPending(false);
    }
  }, [chatPathname, conversationId]);

  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(PENDING_CHAT_DRAFT_KEY);
      if (draft != null && draft !== "") {
        // We'll return this so the caller can restore it
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** 已登录：仅当停在 `/chat` 时可用 localStorage 恢复到 `/chat/:id` */
  useEffect(() => {
    if (authLoading || !token) return;
    if (normalizePathname(chatPathname) !== "/chat") {
      setSessionRestorePending(false);
      return;
    }
    setSessionRestorePending(true);
    let cancelled = false;
    void (async () => {
      try {
        const mapped = await refreshServerConversationsTracked();
        if (cancelled) return;
        const savedId = localStorage.getItem("tcm_conversation_id")?.trim();
        if (!savedId || !mapped?.some((c) => c.id === savedId)) {
          setSessionRestorePending(false);
          return;
        }
        router.replace(chatPathConversation(savedId));
      } catch (e) {
        if (!cancelled) setSessionRestorePending(false);
        if (process.env.NODE_ENV === "development") {
          console.warn("[useChat] restore session:", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, chatPathname, refreshServerConversationsTracked, router]);

  /** 路径为会话 id 时：认证后加载消息（folder/invalid/new 仍由 HomePageClient 处理） */
  useEffect(() => {
    if (authLoading) return;
    const parsed = parseChatPathname(chatPathname);
    if (parsed.kind !== "conversation") return;
    if (!token) {
      router.replace(chatPathNew());
      return;
    }
    const urlId = parsed.conversationId;
    if (conversationId === urlId) return;
    void handleSelectConversation(urlId);
  }, [authLoading, token, chatPathname, conversationId, router, handleSelectConversation]);

  /** 已登录：刷新 `/chat/folder/:id` 时拉取会话与分组列表（否则侧栏与分组工作台为空） */
  useEffect(() => {
    if (authLoading || !token) return;
    const parsed = parseChatPathname(chatPathname);
    if (parsed.kind !== "folder") return;
    let cancelled = false;
    void (async () => {
      try {
        await refreshServerConversationsTracked();
      } catch (e) {
        if (!cancelled && process.env.NODE_ENV === "development") {
          console.warn("[useChat] refresh on folder page:", e);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, chatPathname, refreshServerConversationsTracked]);

  useEffect(() => {
    const parsed = parseChatPathname(chatPathname);
    if (parsed.kind === "conversation") setSessionRestorePending(false);
  }, [chatPathname]);

  /** 未登录：清空服务端会话缓存与本地残留匿名状态 */
  useEffect(() => {
    if (authLoading || token) return;
    loadMessagesAbortRef.current?.abort();
    loadMessagesAbortRef.current = null;
    initialListLoadedRef.current = false;
    setMessagesLoading(false);
    setListLoading(false);
    setSessionRestorePending(false);
    resetFollowUpSuggestions();
    setServerConversations([]);
    setConversationFolders([]);
    localStorage.removeItem("tcm_conversation_id");
    localStorage.removeItem("tcm_anon_secret");
    setConversationId(null);
    setMessages([]);
    setHasStarted(false);
    setGenState("idle");
    setIsGeneratingTitle(false);
    setPendingImageUrls([]);
    setRoundTokensUsage(null);
    setConversationUsageFromDb(null);
    cancelAttachmentUploadAnimations();
    thinkingStepStartedAt.current = {};
    traceStartedAt.current = {};
  }, [authLoading, token, cancelAttachmentUploadAnimations, resetFollowUpSuggestions, setConversationId]);

  return {
    // state
    messages,
    setMessages,
    hasStarted,
    chatSurfacePhase,
    urlConversationId,
    conversationRouteSynced,
    messagesLoading,
    listLoading,
    sessionRestorePending,
    genState,
    conversationId,
    inputBarUsageHint,
    serverConversations,
    isGeneratingTitle,
    lastAssistantMessageId,
    followUpSuggestions,
    followUpsLoadingForId,
    deleteTargetId,
    deletePending,
    bulkDeletePending,
    movePendingId,
    conversationFolders,
    pinnedIds,
    // feature toggles
    deepThinkEnabled,
    setDeepThinkEnabled,
    webSearchEnabled,
    setWebSearchEnabled,
    webSearchMode,
    setWebSearchMode,
    chatModelCatalog: modelCatalog,
    chatAgentId,
    setChatAgentId,
    selectedProviderId,
    selectedChatModelId,
    setModelPick,
    pendingImageUrls,
    attachmentUploadBusy,
    attachmentUploadSkeletonCount,
    attachmentUploadSlotProgress,
    pushImageAttachments,
    removePendingImageUrlAt,
    applyComposerAttachmentsFromUserMessage,
    fetchAiImageQuickPrompts,
    // handlers
    handleWidgetAnswer,
    handleSend,
    handleStop,
    handleRegenerateAssistant,
    handleNewChat,
    handleSelectConversation,
    refreshServerConversations,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDeleteConversation,
    moveConversationToGroup,
    createFolder,
    renameFolder,
    deleteFolder,
    togglePinConversation,
    deleteConversationsBulk,
    sseRouteAssignPending,
  };
}
