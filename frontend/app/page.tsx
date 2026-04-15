"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/chat/Sidebar";
import { useAuth } from "@/contexts/auth-context";
import { API_BASE } from "@/lib/api";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { ToolCallIndicator } from "@/components/chat/ToolCallIndicator";
import { ThinkingIndicator } from "@/components/chat/ThinkingIndicator";
import { ClaudeStar } from "@/components/chat/ClaudeStar";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, Mic, Send, ChevronDown, PenLine, BookOpen, Leaf, Sun, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Message = {
  id: string;
  role?: "user" | "assistant";
  type?: "message" | "thinking" | "tool";
  content?: string;
  toolName?: string;
  /** 思考段结束后的时长（秒），持久化来自服务端 duration_sec） */
  thinkingDurationSec?: number;
  /** 与后端 tool-call / tool-result 的 runId 对齐，用于配对多条工具 */
  runId?: string;
  status?: "running" | "success" | "error";
  /** 助手消息：来自 SSE meta.chatModel */
  modelName?: string;
};

type ApiMessageRow = {
  id: string;
  role: string;
  content: string;
  duration_sec?: number | null;
  model_name?: string | null;
};

function mapApiRowToMessage(msg: ApiMessageRow): Message {
  if (msg.role === "thinking") {
    return {
      id: msg.id,
      type: "thinking",
      content: msg.content,
      thinkingDurationSec:
        msg.duration_sec != null && msg.duration_sec >= 0
          ? msg.duration_sec
          : undefined,
    };
  }
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant",
    type: "message",
    content: msg.content,
    modelName:
      msg.role === "assistant" && msg.model_name
        ? msg.model_name
        : undefined,
  };
}

type GenerationState = 'idle' | 'waiting' | 'thinking' | 'tool' | 'typing';

const springTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

const messageTransition = {
  type: "spring" as const,
  stiffness: 200,
  damping: 28,
  mass: 0.6,
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** 未登录点发送时暂存输入框，从 /login 返回首页后恢复 */
const PENDING_CHAT_DRAFT_KEY = "tcm_pending_chat_draft";

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [genState, setGenState] = useState<GenerationState>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  /** 当前流式请求在首个 text-delta 前由 meta 写入，用于助手消息展示模型名 */
  const pendingChatModelRef = useRef<string | undefined>(undefined);
  /** 流式思考块开始时间，用于右侧「思考时长」与收尾结算 */
  const thinkingBlockStartedAt = useRef<Record<string, number>>({});
  
  const [conversationId, setConversationId] = useState<string | null>(null);
  /** 当前正在接收流式 thinking-delta 的那一条思考块 id；仅该块显示「思考中」动效 */
  const [streamingThinkingId, setStreamingThinkingId] = useState<string | null>(null);
  const [serverConversations, setServerConversations] = useState<
    { id: string; title: string }[]
  >([]);
  const { token, loading: authLoading, logout } = useAuth();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const refreshServerConversations = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { id: string; title: string }[];
    if (!Array.isArray(data)) return;
    setServerConversations(
      data.map((x) => ({ id: x.id, title: x.title?.trim() || "未命名" }))
    );
  }, [token]);

  const scrollToBottom = (smooth: boolean) => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: smooth ? "smooth" : "auto",
      block: "end"
    });
  };

  useEffect(() => {
    const isSmooth = genState === "idle" || genState === "waiting";
    scrollToBottom(isSmooth);
  }, [messages, genState]);

  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(PENDING_CHAT_DRAFT_KEY);
      if (draft != null && draft !== "") {
        setInput(draft);
        sessionStorage.removeItem(PENDING_CHAT_DRAFT_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** 已登录：拉服务端会话列表并恢复上次打开的会话（依赖长度固定为 2，避免 HMR 告警） */
  useEffect(() => {
    if (authLoading || !token) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { id: string; title: string }[];
        const mapped = Array.isArray(data)
          ? data.map((x) => ({
              id: x.id,
              title: x.title?.trim() || "未命名",
            }))
          : [];
        if (cancelled) return;
        setServerConversations(mapped);
        const savedId = localStorage.getItem("tcm_conversation_id");
        if (!savedId || !mapped.some((c) => c.id === savedId)) return;

        setConversationId(savedId);
        setHasStarted(true);
        const mr = await fetch(
          `${API_BASE}/api/chat/conversations/${savedId}/messages`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!mr.ok || cancelled) return;
        const msgs = (await mr.json()) as ApiMessageRow[];
        if (!Array.isArray(msgs) || cancelled) return;
        setMessages(msgs.map(mapApiRowToMessage));
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, token]);

  /** 未登录：清空服务端会话缓存与本地残留匿名状态，避免登出后仍显示旧列表 */
  useEffect(() => {
    if (authLoading || token) return;
    setServerConversations([]);
    localStorage.removeItem("tcm_conversation_id");
    localStorage.removeItem("tcm_anon_secret");
    setConversationId(null);
    setMessages([]);
    setHasStarted(false);
    setGenState("idle");
    setStreamingThinkingId(null);
  }, [authLoading, token]);

  const loadMessagesWithToken = async (convId: string, accessToken: string) => {
    const res = await fetch(
      `${API_BASE}/api/chat/conversations/${convId}/messages`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) throw new Error("Failed to fetch messages");
    const data = (await res.json()) as ApiMessageRow[];
    if (!Array.isArray(data)) return;
    setMessages(data.map(mapApiRowToMessage));
  };

  const finalizeThinkingBlock = (id: string | null) => {
    if (!id) return;
    const start = thinkingBlockStartedAt.current[id];
    if (start == null) return;
    const sec = Math.max(0, (Date.now() - start) / 1000);
    delete thinkingBlockStartedAt.current[id];
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.type === "thinking"
          ? { ...m, thinkingDurationSec: sec }
          : m
      )
    );
  };

  const handleSelectConversation = async (id: string) => {
    if (genState !== "idle" || !token) return;
    setStreamingThinkingId(null);
    setMessages([]);

    setConversationId(id);
    localStorage.setItem("tcm_conversation_id", id);
    setHasStarted(true);
    try {
      await loadMessagesWithToken(id, token);
    } catch (e) {
      console.error(e);
    }
  };

  const runChatStream = async (userText: string, appendUserMessage: boolean) => {
    if (!token) return;

    pendingChatModelRef.current = undefined;

    if (appendUserMessage) {
      const userMsgId = Date.now().toString();
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", type: "message", content: userText },
      ]);
    }

    setGenState("waiting");
    const startTime = Date.now();

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userText,
          conversation_id: conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // 强制让星星至少旋转 600ms，保证视觉上的“思考前摇”
      const elapsed = Date.now() - startTime;
      if (elapsed < 600) {
        await delay(600 - elapsed);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      if (!reader) return;

      const currentAssistantMsgId = Date.now().toString() + "-msg";
      /** 当前这一段连续思考的块 id；遇到 tool / 正文输出时清空，下一段 thinking 新开一块 */
      let openThinkingBlockId: string | null = null;
      let toolRunStartedAt: number | null = null;

      let hasAssistantMsg = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') continue;

            try {
              const data = JSON.parse(dataStr);
              
              if (data.type === "meta") {
                if (data.conversationId) {
                  setConversationId(data.conversationId);
                  localStorage.setItem("tcm_conversation_id", data.conversationId);
                }
                if (
                  typeof data.chatModel === "string" &&
                  data.chatModel.trim() !== ""
                ) {
                  pendingChatModelRef.current = data.chatModel.trim();
                }
              }
              else if (data.type === 'thinking-delta') {
                const piece = data.textDelta ?? "";
                if (openThinkingBlockId === null) {
                  const nid = `think-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
                  openThinkingBlockId = nid;
                  thinkingBlockStartedAt.current[nid] = Date.now();
                  setStreamingThinkingId(nid);
                  setGenState('thinking');
                  setMessages((prev) => [...prev, { id: nid, type: 'thinking', content: piece }]);
                } else {
                  setGenState('thinking');
                  const tid = openThinkingBlockId;
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === tid
                        ? { ...msg, content: (msg.content || "") + piece }
                        : msg
                    )
                  );
                }
              } 
              else if (data.type === 'tool-call') {
                finalizeThinkingBlock(openThinkingBlockId);
                openThinkingBlockId = null;
                setStreamingThinkingId(null);
                const runKey = data.runId ?? `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                const rowId = `tool-${runKey}`;
                toolRunStartedAt = Date.now();
                setGenState('tool');
                setMessages((prev) => [
                  ...prev,
                  {
                    id: rowId,
                    type: 'tool',
                    toolName: data.name,
                    status: 'running',
                    runId: data.runId ?? runKey,
                  },
                ]);
              } 
              else if (data.type === 'tool-result') {
                openThinkingBlockId = null;
                setStreamingThinkingId(null);
                const rid = data.runId as string | undefined;
                const elapsed = toolRunStartedAt != null ? Date.now() - toolRunStartedAt : 999;
                toolRunStartedAt = null;
                if (elapsed < 420) await delay(420 - elapsed);
                setMessages((prev) => {
                  let idx = -1;
                  if (rid != null) {
                    idx = prev.findIndex(
                      (m) => m.type === 'tool' && m.status === 'running' && m.runId === rid
                    );
                  }
                  if (idx === -1) {
                    idx = prev.findIndex((m) => m.type === 'tool' && m.status === 'running');
                  }
                  if (idx === -1) return prev;
                  return prev.map((m, i) =>
                    i === idx ? { ...m, status: 'success' as const } : m
                  );
                });
                await delay(150);
              } 
              else if (data.type === 'text-delta') {
                finalizeThinkingBlock(openThinkingBlockId);
                openThinkingBlockId = null;
                setStreamingThinkingId(null);
                if (!hasAssistantMsg) {
                  hasAssistantMsg = true;
                  setGenState('typing');
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: currentAssistantMsgId,
                      role: 'assistant',
                      type: 'message',
                      content: data.textDelta,
                      modelName: pendingChatModelRef.current,
                    },
                  ]);
                } else {
                  setGenState('typing');
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === currentAssistantMsgId
                        ? { ...msg, content: (msg.content || "") + data.textDelta }
                        : msg
                    )
                  );
                }
              } 
              else if (data.type === 'error') {
                 console.error("Backend error:", data.message);
                 setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", type: "message", content: `**Error:** ${data.message}` }]);
              }
            } catch (e) {
              console.error("Error parsing SSE data", e);
            }
          }
        }
      }
      finalizeThinkingBlock(openThinkingBlockId);
      await refreshServerConversations();
      setStreamingThinkingId(null);
      setGenState('idle');
    } catch (error) {
      console.error('Chat error:', error);
      for (const id of Object.keys(thinkingBlockStartedAt.current)) {
        finalizeThinkingBlock(id);
      }
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", type: "message", content: "**网络错误**：无法连接到服务器，请确保后端服务已启动。" }]);
      setStreamingThinkingId(null);
      setGenState('idle');
    }
  };

  const handleSend = async () => {
    if (!input.trim() || genState !== "idle") return;
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

    const userText = input.trim();
    setInput("");
    setHasStarted(true);
    await runChatStream(userText, true);
  };

  const handleRegenerateAssistant = (assistantMsgId: string) => {
    if (genState !== "idle" || !token) return;
    const idx = messages.findIndex((m) => m.id === assistantMsgId);
    if (idx <= 0) return;
    let userText: string | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.type === "message" && m.role === "user" && m.content) {
        userText = m.content;
        break;
      }
    }
    if (!userText) return;
    setMessages((prev) => prev.slice(0, idx));
    void runChatStream(userText, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleNewChat = () => {
    localStorage.removeItem("tcm_conversation_id");
    localStorage.removeItem("tcm_anon_secret");
    setConversationId(null);
    setMessages([]);
    thinkingBlockStartedAt.current = {};
    setHasStarted(false);
    setGenState("idle");
    setStreamingThinkingId(null);
    if (token) {
      void refreshServerConversations();
    }
  };

  const closeDeleteDialog = useCallback(() => {
    if (deletePending) return;
    setDeleteTargetId(null);
  }, [deletePending]);

  const openDeleteDialog = (id: string) => {
    if (!token) return;
    setDeleteTargetId(id);
  };

  const confirmDeleteConversation = async () => {
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

      if (conversationId === id) {
        handleNewChat();
      }
      setDeleteTargetId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#fdfdfc]">
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="删除会话"
        description="确定删除该会话？删除后无法恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        pending={deletePending}
        onConfirm={() => void confirmDeleteConversation()}
        onCancel={closeDeleteDialog}
      />
      <Sidebar
        conversations={token ? serverConversations : []}
        activeId={conversationId}
        onNewChat={handleNewChat}
        onSelect={handleSelectConversation}
        onDelete={openDeleteDialog}
      />

      <main className="flex-1 flex flex-col relative min-w-0">
        {/* 桌面端右上角用户菜单（loading 时占位，避免未恢复登录态时闪空白） */}
        {authLoading ? (
          <div
            className="hidden md:flex absolute top-4 right-6 z-50 h-11 w-11 rounded-full bg-gray-200/70 animate-pulse"
            aria-hidden
          />
        ) : token ? (
          <div className="hidden md:flex absolute top-4 right-6 z-50">
            <div className="relative group">
              <button
                type="button"
                className="flex items-center justify-center w-11 h-11 rounded-full bg-white border border-[#e5e5e5] shadow-sm hover:bg-gray-50 transition-colors"
                aria-label="账户"
              >
                <span className="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold">
                  P
                </span>
              </button>
              <div className="absolute right-0 top-full mt-2 w-32 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                <div className="bg-white rounded-lg shadow-lg border border-[#e5e5e5] py-1">
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    退出登录
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <header className="h-14 flex items-center justify-between px-4 border-b border-[#e5e5e5] md:hidden">
          <div className="font-semibold text-sm">TCM AI</div>
          <div className="flex items-center gap-1">
            {authLoading ? (
              <div
                className="h-8 w-14 rounded-md bg-gray-100 animate-pulse"
                aria-hidden
              />
            ) : !token ? (
              <Link
                href="/login"
                className="text-sm text-gray-600 px-2 py-1 rounded-md hover:bg-gray-100"
              >
                登录
              </Link>
            ) : (
              <div className="relative group">
                <button
                  type="button"
                  className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="账户"
                >
                  <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                    P
                  </span>
                </button>
                <div className="absolute right-0 top-full mt-1 w-32 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="bg-white rounded-lg shadow-lg border border-[#e5e5e5] py-1">
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      退出登录
                    </button>
                  </div>
                </div>
              </div>
            )}
            <button type="button" onClick={handleNewChat} className="p-2">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 flex flex-col relative overflow-hidden">
          
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence>
              {hasStarted && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="pt-8"
                >
                  {messages.map((msg) => {
                    if (msg.type === "message") {
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 20, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={messageTransition}
                        >
                          <MessageBubble
                            role={msg.role!}
                            content={msg.content!}
                            modelName={msg.modelName}
                            assistantActionsDisabled={genState !== "idle"}
                            onAssistantRegenerate={
                              msg.role === "assistant"
                                ? () => handleRegenerateAssistant(msg.id)
                                : undefined
                            }
                            onUserEdit={
                              msg.role === "user"
                                ? (text) => {
                                    setInput(text);
                                    requestAnimationFrame(() =>
                                      inputRef.current?.focus()
                                    );
                                  }
                                : undefined
                            }
                          />
                        </motion.div>
                      );
                    }
                    if (msg.type === "thinking") {
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={messageTransition}
                        >
                          <ThinkingIndicator
                            isThinking={
                              streamingThinkingId === msg.id && genState === 'thinking'
                            }
                            content={msg.content!}
                            durationSec={msg.thinkingDurationSec}
                          />
                        </motion.div>
                      );
                    }
                    if (msg.type === "tool") {
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={messageTransition}
                        >
                          <ToolCallIndicator toolName={msg.toolName!} status={msg.status!} />
                        </motion.div>
                      );
                    }
                    return null;
                  })}
                  
                  <AnimatePresence>
                    {genState === 'waiting' && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0, scale: 0.5 }}
                        animate={{ opacity: 1, height: "auto", scale: 1 }}
                        exit={{ opacity: 0, height: 0, scale: 0.5, transition: { duration: 0 } }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="w-full max-w-3xl mx-auto px-4 md:px-0 flex justify-start overflow-hidden"
                        style={{ transformOrigin: "left center" }}
                      >
                        <div className="py-3">
                          <ClaudeStar />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div ref={messagesEndRef} className="h-[40vh] min-h-[240px] shrink-0" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.div 
            layout
            transition={springTransition}
            className={`absolute left-0 right-0 px-4 md:px-8 flex flex-col items-center z-10 ${
              hasStarted 
                ? "bottom-0 pb-6 pt-4 bg-gradient-to-t from-[#fdfdfc] via-[#fdfdfc] to-transparent" 
                : "bottom-[45%]"
            }`}
          >
            <AnimatePresence mode="popLayout">
              {!hasStarted && (
                <motion.div 
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="mb-8 flex items-center gap-3 text-3xl md:text-4xl font-serif text-[#1a1a1a]"
                >
                  <Sun className="w-8 h-8 text-orange-500" />
                  <span>需要中医咨询吗？</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="w-full max-w-3xl relative">
              <motion.div 
                layout
                transition={springTransition}
                className="relative flex flex-col w-full bg-white rounded-2xl border border-[#e5e5e5] shadow-[0_2px_10px_rgba(0,0,0,0.02)] focus-within:border-gray-300 focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.05)] transition-shadow overflow-hidden"
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="描述您的症状，或询问中医知识..."
                  className="w-full max-h-[200px] min-h-[60px] py-4 px-4 bg-transparent resize-none outline-none text-[16px] text-gray-800 placeholder:text-gray-400"
                  rows={1}
                />
                
                <motion.div layout="position" className="flex items-center justify-between px-3 pb-3 pt-1">
                  <button className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                  
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                      TCM Pro 1.0
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={genState !== "idle"}
                      className={`p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center ${
                        input.trim() && genState === "idle"
                          ? "bg-black text-white hover:bg-gray-800 scale-105"
                          : "bg-transparent text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      }`}
                    >
                      {input.trim() ? <Send className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    </button>
                  </div>
                </motion.div>
              </motion.div>

              <AnimatePresence mode="popLayout">
                {!hasStarted && (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="flex flex-wrap items-center justify-center gap-2 mt-6"
                  >
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() =>
                        setInput("我最近总是失眠多梦，该怎么调理？")
                      }
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e5e5] rounded-full text-sm text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      <PenLine className="w-4 h-4 text-blue-500" />
                      症状自查
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() =>
                        setInput("六味地黄丸的功效和禁忌是什么？")
                      }
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e5e5] rounded-full text-sm text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      <BookOpen className="w-4 h-4 text-green-500" />
                      方剂查询
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() =>
                        setInput("春季养肝有什么好的食疗建议？")
                      }
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-[#e5e5e5] rounded-full text-sm text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                    >
                      <Leaf className="w-4 h-4 text-orange-500" />
                      节气养生
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <AnimatePresence>
                {hasStarted && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="text-center mt-3 text-xs text-gray-400 font-medium"
                  >
                    AI 可能会产生误导性信息，请结合实际情况判断。
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
