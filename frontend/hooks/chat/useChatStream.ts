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
  } = deps;

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

  return { runChatStream };
}

