"use client";

import { useCallback } from "react";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { API_BASE } from "@/lib/api";
import { chatPathConversation } from "@/lib/chatRoutes";
import { parseSseDataLine } from "@/lib/chat/sseParser";
import { toolIoToPreview, sumThinkingDurations } from "@/lib/chatUtils";
import {
  agentIdForChatRequest,
  applyFinalizeThinkingStepToMessages,
  delay,
  isLikelyUserAbort,
  normalizedUsageDelta,
} from "@/hooks/chat/chatHelpers";
import type {
  ChatMessage,
  Message,
  ServerConversation,
  ToolStep,
  TraceMessage,
  WidgetMessage,
} from "@/types/chat";

export type UseChatStreamDeps = {
  token: string | null;
  conversationId: string | null;
  deepThinkEnabled: boolean;
  webSearchEnabled: boolean;
  webSearchMode: "force" | "auto";
  effectiveLlmPick: { llm_provider: string; chat_model: string } | null;
  chatAgentId: string | null;
  router: AppRouterInstance;
  autoFollowMainRef: React.MutableRefObject<boolean>;
  getPreferredGroupForNewConversation?: () => string | null;
  pendingChatModelRef: React.MutableRefObject<string | undefined>;
  pendingNewConversationGroupRef: React.MutableRefObject<string | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  conversationIdRef: React.MutableRefObject<string | null>;
  thinkingStepStartedAt: React.MutableRefObject<Record<string, number>>;
  traceStartedAt: React.MutableRefObject<Record<string, number>>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setGenState: React.Dispatch<React.SetStateAction<import("@/types/chat").GenerationState>>;
  setIsGeneratingTitle: React.Dispatch<React.SetStateAction<boolean>>;
  setRoundTokensUsage: React.Dispatch<
    React.SetStateAction<{ prompt: number; completion: number; total: number } | null>
  >;
  setSseRouteAssignPending: React.Dispatch<React.SetStateAction<boolean>>;
  setConversationId: (next: string | null) => void;
  setServerConversations: React.Dispatch<React.SetStateAction<ServerConversation[]>>;
  resetFollowUpSuggestions: () => void;
  enqueueFollowUpsRequest: (
    assistantMsgId: string,
    assistantBody: string,
    userText: string,
  ) => void;
  refreshServerConversations: () => Promise<ServerConversation[] | null | void>;
  refreshConversationBillingTotals: (cid: string | null) => Promise<void>;
  /** SSE 流式 error 后从服务端重载消息，与入库的错误助手气泡对齐 */
  reloadConversationMessages: (conversationId: string) => Promise<void>;
};

export function useChatStream(deps: UseChatStreamDeps) {
  const {
    token,
    conversationId,
    deepThinkEnabled,
    webSearchEnabled,
    webSearchMode,
    effectiveLlmPick,
    chatAgentId,
    router,
    autoFollowMainRef,
    getPreferredGroupForNewConversation,
    pendingChatModelRef,
    pendingNewConversationGroupRef,
    abortControllerRef,
    conversationIdRef,
    thinkingStepStartedAt,
    traceStartedAt,
    setMessages,
    setGenState,
    setIsGeneratingTitle,
    setRoundTokensUsage,
    setSseRouteAssignPending,
    setConversationId,
    setServerConversations,
    resetFollowUpSuggestions,
    enqueueFollowUpsRequest,
    refreshServerConversations,
    refreshConversationBillingTotals,
    reloadConversationMessages,
  } = deps;

  const finalizeThinkingStep = useCallback((traceId: string | null, stepId: string | null) => {
    if (!traceId || !stepId) return;
    if (thinkingStepStartedAt.current[stepId] == null) return;
    setMessages((prev) =>
      applyFinalizeThinkingStepToMessages(prev, traceId, stepId, thinkingStepStartedAt.current)
    );
  }, []);

  const finalizeTrace = useCallback(
    (
      traceId: string | null,
      collapsed: boolean,
      options: { aborted?: boolean } = {},
    ) => {
      if (!traceId) return;
      const start = traceStartedAt.current[traceId];
      const elapsedSec =
        start != null ? Math.max(0, (Date.now() - start) / 1000) : undefined;
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
                ...(options.aborted ? { aborted: true } : {}),
              }
            : m
        )
      );
    },
    [],
  );

  /** 用户中止 / SSE 错误后，将 trace 内仍在 running 的工具收口为「已终止」状态。 */
  const markRunningToolsAborted = useCallback(
    (traceId: string | null, reason: "aborted" | "error" = "aborted") => {
      if (!traceId) return;
      const label = reason === "aborted" ? "已终止" : "已中断";
      setMessages((prev) =>
        prev.map((m) => {
          if (m.type !== "trace" || m.id !== traceId) return m;
          return {
            ...m,
            steps: m.steps.map((step) =>
              step.type === "tool" && step.status === "running"
                ? {
                    ...step,
                    status: "error" as const,
                    aborted: true,
                    outputPreview: step.outputPreview ?? label,
                  }
                : step,
            ),
          };
        }),
      );
    },
    [],
  );

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
      /** 当前 assistant 气泡的累积文本（用于追问 follow-ups 与导出） */
      let assistantReplyAccum = "";
      // ── Think 模式：buffer-and-decide + mark_summary 边界信号 ────────────
      // think 模式下 text-delta 先写入 trace 内的"pending interim step"（视觉同
      // thinking）。直到模型显式调用 mark_summary 工具，后端发出 `summary-start`
      // 信号，前端把 `inSummaryPhase` 置 true：
      //   - 该信号之后的 text-delta 直接写顶层 assistant 气泡，零跳变
      //   - trace 立即收口、打上 summaryAcknowledged 让 footer 显示「完成」
      // 兜底：若模型未调用 mark_summary 就结束，走 promotePendingInterim（会有一次跳变）。
      const isThinkMode = deepThinkEnabled;
      let pendingInterimStepId: string | null = null;
      let pendingInterimText = "";
      let inSummaryPhase = false;

      /**
       * Think 模式收口：把当前 pending interim step 从 trace 内拎出来，
       * 作为顶层 assistant 气泡。返回 true 表示真的发生了 promote。
       *
       * - normal end: interrupted=false
       * - user abort / SSE error: interrupted=true（assistant 气泡带"已终止"小尾巴）
       *
       * 若 trace 在 promote 后剩 0 个 step（罕见：模型只吐了一段 interim 文本），
       * 该 trace 会被整段移除，避免出现"空 trace 头"。
       *
       * 注：定义在 try 外，便于 catch / finally 也能调用（abort / 网络错误路径）。
       */
      const promotePendingInterim = (interrupted: boolean): boolean => {
        if (!pendingInterimStepId || !currentTraceId) {
          pendingInterimStepId = null;
          pendingInterimText = "";
          return false;
        }
        const traceId = currentTraceId;
        const stepId = pendingInterimStepId;
        const content = pendingInterimText;
        pendingInterimStepId = null;
        pendingInterimText = "";
        if (!content.trim()) return false;
        const newMsgId = `${Date.now()}-msg-${Math.random().toString(36).slice(2, 9)}`;
        setMessages((prev) => {
          const next: Message[] = [];
          for (const msg of prev) {
            if (msg.type === "trace" && msg.id === traceId) {
              const filtered = msg.steps.filter(
                (s) => !(s.type === "thinking" && s.id === stepId),
              );
              if (filtered.length === 0) {
                // 空 trace 直接丢弃
                continue;
              }
              next.push({ ...msg, steps: filtered });
            } else {
              next.push(msg);
            }
          }
          next.push({
            id: newMsgId,
            role: "assistant",
            type: "message",
            content,
            modelName: pendingChatModelRef.current,
            ...(interrupted ? { interrupted: true } : {}),
          });
          return next;
        });
        currentAssistantMsgId = newMsgId;
        hasAssistantMsg = true;
        assistantReplyAccum = content;
        return true;
      };

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

        /**
         * 多 trace 多 bubble 杂乱样式：每"段"工具/思考使用一个 trace；
         * text-delta 来时会 finalize 当前 trace（保持展开），让下一次 tool-call
         * 在 ensureCurrentTraceId 里再新建一个 trace。
         */
        const ensureCurrentTraceId = (): string => {
          if (currentTraceId) return currentTraceId;
          const nid = `trace-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          currentTraceId = nid;
          traceStartedAt.current[nid] = Date.now();
          return nid;
        };

        /** 将 step 追加到 trace；若 trace 尚不存在则在 base 末尾新建 trace 包含该 step。 */
        const upsertTraceWithStep = (
          base: Message[],
          traceIdResolved: string,
          step: import("@/types/brainstorm").BrainstormStep,
        ): Message[] => {
          const exists = base.some(
            (m): m is TraceMessage =>
              m.type === "trace" && m.id === traceIdResolved,
          );
          if (!exists) {
            return [
              ...base,
              {
                id: traceIdResolved,
                type: "trace",
                steps: [step],
                status: "streaming",
                totalDurationSec: undefined,
                collapsed: false,
              } satisfies TraceMessage,
            ];
          }
          return base.map((m) =>
            m.type === "trace" && m.id === traceIdResolved
              ? { ...m, status: "streaming", steps: [...m.steps, step] }
              : m,
          );
        };

        /**
         * text-delta 到达：若有进行中的 trace，将其 finalize 为 done（保持展开），
         * 重置 currentTraceId/openThinkingStepId；**仅在真的关掉了 trace/thinking 时**
         * 分配新的 continuation 气泡 id，让后续 text-delta 写入新气泡——多段正文与
         * 多段 trace 交替的"杂乱"布局靠这一步形成。
         *
         * 若调用时 currentTraceId 已经是 null（即连续多个 text-delta），
         * 则不分配新 bubble id，保证同一段正文持续追加到同一个气泡内。
         */
        const sealCurrentTraceBeforeText = () => {
          const sealing = openThinkingStepId !== null || currentTraceId !== null;
          if (openThinkingStepId) {
            finalizeThinkingStep(currentTraceId, openThinkingStepId);
            openThinkingStepId = null;
          }
          if (currentTraceId) {
            // 杂乱样式：收口同时折叠 trace，让正文上下文清爽；用户可手动展开
            finalizeTrace(currentTraceId, true);
            currentTraceId = null;
          }
          if (sealing) {
            if (hasAssistantMsg) {
              currentAssistantMsgId = `${Date.now()}-msg-${Math.random().toString(36).slice(2, 9)}`;
              hasAssistantMsg = false;
              assistantReplyAccum = "";
            }
            autoFollowMainRef.current = true;
          }
        };

        /**
         * Think 模式 text-delta：把内容写入 trace 内一个 thinking 类型的
         * "pending interim step"。同一段 text 持续累加到同一个 step，
         * 直到下一次 tool-call 到来 → 该 step 固化为 trace 步骤；
         * 直到 stream 结束 → 该 step 被 promote 为顶层 assistant 气泡。
         */
        const appendThinkInterim = (piece: string) => {
          if (!piece) return;
          const traceIdResolved = ensureCurrentTraceId();
          setGenState("typing");
          pendingInterimText += piece;
          if (pendingInterimStepId === null) {
            const nid = `interim-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            pendingInterimStepId = nid;
            setMessages((prev) =>
              upsertTraceWithStep(prev, traceIdResolved, {
                id: nid,
                type: "thinking",
                content: piece,
              }),
            );
          } else {
            const sid = pendingInterimStepId;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.type === "trace" && msg.id === traceIdResolved
                  ? {
                      ...msg,
                      steps: msg.steps.map((step) =>
                        step.type === "thinking" && step.id === sid
                          ? { ...step, content: step.content + piece }
                          : step,
                      ),
                    }
                  : msg,
              ),
            );
          }
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
                // 防御性兜底：summary 阶段后任何 thinking-delta（后端应已过滤）一律忽略，
                // 避免重新 ensureCurrentTraceId 开出第二个 trace 头
                if (inSummaryPhase) {
                  continue;
                }
                if (openThinkingStepId === null) {
                  const traceIdResolved = ensureCurrentTraceId();
                  const nid = `think-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                  openThinkingStepId = nid;
                  thinkingStepStartedAt.current[nid] = Date.now();
                  setGenState("thinking");
                  setMessages((prev) =>
                    upsertTraceWithStep(prev, traceIdResolved, {
                      id: nid,
                      type: "thinking",
                      content: piece,
                    }),
                  );
                } else {
                  setGenState("thinking");
                  const tid = openThinkingStepId;
                  const traceIdResolved = ensureCurrentTraceId();
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.type === "trace" && msg.id === traceIdResolved
                        ? {
                            ...msg,
                            steps: msg.steps.map((step) =>
                              step.type === "thinking" && step.id === tid
                                ? { ...step, content: step.content + piece }
                                : step,
                            ),
                          }
                        : msg,
                    ),
                  );
                }
              } else if (data.type === "tool-call") {
                const stepSnap = openThinkingStepId;
                openThinkingStepId = null;
                // think 模式：当前 pending interim 段被"固化"为 trace 内的一段
                // thinking 步骤（不再向它累加；下一段 text-delta 会开新 step）
                if (isThinkMode) {
                  pendingInterimStepId = null;
                  pendingInterimText = "";
                }
                const traceIdResolved = ensureCurrentTraceId();
                const runKey =
                  sseStr(data.runId) ||
                  `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const rowId = `tool-${runKey}`;
                setGenState("tool");
                setMessages((prev) => {
                  let base = prev;
                  if (stepSnap) {
                    base = applyFinalizeThinkingStepToMessages(
                      base,
                      traceIdResolved,
                      stepSnap,
                      thinkingStepStartedAt.current,
                    );
                  }
                  const toolStep: ToolStep = {
                    id: rowId,
                    type: "tool",
                    toolName: sseStr(data.name) || "tool",
                    mcpRemoteName:
                      sseStr((data as { mcpRemoteName?: unknown }).mcpRemoteName) ||
                      undefined,
                    status: "running",
                    runId: sseStr(data.runId) || runKey,
                    inputPreview: toolIoToPreview((data as { input?: unknown }).input),
                  };
                  return upsertTraceWithStep(base, traceIdResolved, toolStep);
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
                const piece =
                  typeof data.textDelta === "string" ? data.textDelta : "";
                const writeToAssistantBubble = () => {
                  setGenState("typing");
                  if (!hasAssistantMsg) {
                    hasAssistantMsg = true;
                    assistantReplyAccum = piece;
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
                    assistantReplyAccum += piece;
                    setMessages((prev) =>
                      prev.map((msg) =>
                        msg.type === "message" && msg.id === currentAssistantMsgId
                          ? { ...msg, content: (msg.content || "") + piece }
                          : msg,
                      ),
                    );
                  }
                };
                if (inSummaryPhase) {
                  // Summary 阶段：mark_summary 之后的最终答案，直接写顶层气泡，
                  // 不经过 trace（trace 已在 summary-start 时收口、不再扩张）
                  writeToAssistantBubble();
                } else if (isThinkMode) {
                  // Think 模式 + 尚未收到 summary-start：写 trace 内 pending interim
                  appendThinkInterim(piece);
                } else {
                  // 非 think：保持「多 trace 多 bubble」杂乱样式
                  sealCurrentTraceBeforeText();
                  writeToAssistantBubble();
                }
              } else if (data.type === "summary-start") {
                // think 模式专属：mark_summary 工具触发，trace 阶段结束。
                // - 当前 pending interim 段已经在 trace 里作为 thinking step；
                //   不再 promote，保留为"过渡话术"
                // - trace 即刻 finalize（折叠 + summaryAcknowledged），footer 显示「完成」
                // - 重置 assistant 气泡 id / 计数；后续 text-delta 走 writeToAssistantBubble
                finalizeThinkingStep(currentTraceId, openThinkingStepId);
                openThinkingStepId = null;
                pendingInterimStepId = null;
                pendingInterimText = "";
                if (currentTraceId) {
                  const traceIdToFinalize = currentTraceId;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.type === "trace" && m.id === traceIdToFinalize
                        ? { ...m, summaryAcknowledged: true }
                        : m,
                    ),
                  );
                  finalizeTrace(traceIdToFinalize, true);
                  currentTraceId = null;
                }
                if (hasAssistantMsg) {
                  currentAssistantMsgId = `${Date.now()}-msg-${Math.random().toString(36).slice(2, 9)}`;
                  hasAssistantMsg = false;
                  assistantReplyAccum = "";
                }
                inSummaryPhase = true;
                autoFollowMainRef.current = true;
                setGenState("typing");
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
                // think 模式：widget 前的最后一段 interim text 视为「提问前的说明」，
                // 升级为正常 assistant 气泡（非 interrupted），让 widget 卡在它下方
                if (isThinkMode) {
                  promotePendingInterim(false);
                  if (currentTraceId) finalizeTrace(currentTraceId, true);
                  currentTraceId = null;
                }
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
                if (isThinkMode) {
                  // think 模式下，把当前 pending interim 升级为带 interrupted
                  // 标记的助手气泡，之后下面的「**Error:** ...」会拼在它后面
                  promotePendingInterim(true);
                }
                if (currentTraceId) {
                  markRunningToolsAborted(currentTraceId, "error");
                  finalizeTrace(currentTraceId, true, { aborted: true });
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
        // think 模式：把最后那段 pending interim 升级为顶层 assistant 气泡
        // 作为「最终总结」
        if (isThinkMode) {
          promotePendingInterim(false);
        }
        // 流正常结束：trace 自动折叠，只露一行 headline；用户可手动展开
        if (currentTraceId) finalizeTrace(currentTraceId, true);

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
        const cidAfterError = conversationIdRef.current;
        if (
          !abortController.signal.aborted &&
          streamEndedWithSSEError &&
          cidAfterError &&
          token
        ) {
          try {
            await reloadConversationMessages(cidAfterError);
          } catch (e) {
            console.error("Reload messages after stream error failed:", e);
          }
        }
        if (!abortController.signal.aborted) {
          setGenState("idle");
        }
      } catch (error) {
        // 真实网络/解析错误（用户主动中止在 finally 中收口，避免出现「伪网络错误」气泡）
        if (!isLikelyUserAbort(error, abortController.signal)) {
          console.error("Chat error:", error);
          finalizeThinkingStep(currentTraceId, openThinkingStepId);
          if (isThinkMode) {
            promotePendingInterim(true);
          }
          if (currentTraceId) {
            markRunningToolsAborted(currentTraceId, "error");
            finalizeTrace(currentTraceId, true, { aborted: true });
          }
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
          // think 模式：abort 时把 pending interim 升级为带 interrupted 的助手气泡
          // （选项 Y）。这样用户看到的最后一条 assistant 内容是模型 abort 前在写的那段。
          const promotedOnAbort = isThinkMode
            ? promotePendingInterim(true)
            : false;
          if (currentTraceId) {
            markRunningToolsAborted(currentTraceId, "aborted");
            finalizeTrace(currentTraceId, true, { aborted: true });
          }
          // promote 已经把内容写成新的 assistant 气泡且自带 interrupted=true，
          // 无需下面的 lastAi 兜底逻辑（避免重复打标记或追加空气泡）
          if (!promotedOnAbort) setMessages((prev) => {
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
      markRunningToolsAborted,
      refreshServerConversations,
      getPreferredGroupForNewConversation,
      resetFollowUpSuggestions,
      enqueueFollowUpsRequest,
      refreshConversationBillingTotals,
      reloadConversationMessages,
      router,
      chatAgentId,
    ]
  );

  return { runChatStream };
}

