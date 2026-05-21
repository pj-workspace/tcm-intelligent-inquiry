"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BrainstormPanel, ClaudeStar, MessageBubble } from "@/components/chat";
import { WidgetCard } from "@/components/chat/messages/WidgetCard";
import type { ChatMessage, Message } from "@/types/chat";
import type { GenerationState } from "@/types/chat";

const messageTransition = { type: "spring" as const, stiffness: 200, damping: 28, mass: 0.6 };
const messageEnterInitial = { opacity: 0, y: 20, scale: 0.98 };
const traceEnterInitial = { opacity: 0, y: 15 };

/** 工具调用会在 trace 前后拆出多条助手消息：只在「该轮最后一次助手分段」显示工具栏 */
function assistantSegmentShowsToolbar(messages: Message[], index: number): boolean {
  const cur = messages[index];
  if (cur?.type !== "message" || cur.role !== "assistant") return true;
  for (let j = index + 1; j < messages.length; j++) {
    const m = messages[j];
    if (m.type === "message" && m.role === "user") break;
    if (m.type === "message" && m.role === "assistant") return false;
    if (m.type === "widget") return false;
    // 流式 trace 仍在进行，本段不会是最终段（后续会再开新助手气泡承接工具结果）
    if (m.type === "trace" && m.status === "streaming") return false;
  }
  return true;
}

export type ChatMessageListProps = {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  skipHistoryEnter: boolean;
  showMessagesRefreshingOverlay: boolean;
  genState: GenerationState;
  lastAssistantMessageId: string | null;
  followUpSuggestions: { messageId: string; items: string[] } | null;
  onFollowUpClick: (text: string) => void;
  onAssistantRegenerate: (messageId: string) => void;
  onUserEdit: (text: string, imageUrls?: string[]) => void;
  onWidgetAnswer: (widgetId: string, answer: string | null) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
};

/**
 * 等待指示器秒数：waiting / tool / thinking 时计时；idle / typing 清零。
 * 等待 ≥3 秒时在 ClaudeStar 旁附 "Ns" 缓解"是否卡住"焦虑。
 */
function useWaitingElapsedSec(genState: GenerationState): number {
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (genState === "idle" || genState === "typing") {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    setElapsedSec(0);
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [genState]);
  return elapsedSec;
}

export function ChatMessageList({
  messages,
  setMessages,
  skipHistoryEnter,
  showMessagesRefreshingOverlay,
  genState,
  lastAssistantMessageId,
  followUpSuggestions,
  onFollowUpClick,
  onAssistantRegenerate,
  onUserEdit,
  onWidgetAnswer,
  messagesEndRef,
}: ChatMessageListProps) {
  const waitingElapsedSec = useWaitingElapsedSec(genState);
  // 流式中只要不是逐字输出，就显示 ClaudeStar 等待指示（waiting / tool / thinking）。
  // trace 卡片自身展示工具进度；ClaudeStar 只是底部"还在动"的兜底反馈。
  const showWaitingIndicator =
    genState === "waiting" || genState === "tool" || genState === "thinking";
  return (
    <div className="relative pt-8 pb-4 md:pb-5">
      {showMessagesRefreshingOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 bg-[#fdfdfc]/50"
          aria-busy
          aria-label="正在加载对话"
        />
      ) : null}
      {messages.map((msg, idx) => {
  const prevMsg = messages[idx - 1];
  const nextMsg = messages[idx + 1];
  if (msg.type === "message") {
    const afterTrace = prevMsg?.type === "trace";
    const beforeTrace =
      msg.role === "assistant" && nextMsg?.type === "trace";
    /** 紧跟一个仍在流式的 trace：该段助手不是最终段，避免占住一行工具栏占位 */
    const beforeStreamingTrace =
      beforeTrace && nextMsg?.type === "trace" && nextMsg.status === "streaming";
    return (
      <motion.div
        key={msg.id}
        initial={skipHistoryEnter ? false : messageEnterInitial}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={messageTransition}
      >
        <MessageBubble
          role={msg.role!}
          content={msg.content!}
          userImageUrls={
            msg.type === "message" && msg.role === "user"
              ? (msg as ChatMessage).imageUrls
              : undefined
          }
          modelName={msg.modelName}
          noTopPad={afterTrace && msg.role === "assistant"}
          noBottomPad={beforeTrace}
          interrupted={msg.interrupted}
          assistantToolbarReserve={
            msg.role === "assistant" &&
            msg.id === lastAssistantMessageId &&
            !beforeStreamingTrace
          }
          assistantActionsDisabled={genState !== "idle"}
          followUpItems={
            msg.role === "assistant" &&
            msg.id === lastAssistantMessageId &&
            followUpSuggestions?.messageId === msg.id
              ? followUpSuggestions.items
              : undefined
          }
          onFollowUpClick={
            msg.role === "assistant" && msg.id === lastAssistantMessageId
              ? onFollowUpClick
              : undefined
          }
          onAssistantRegenerate={
            msg.role === "assistant" && msg.id === lastAssistantMessageId
              ? () => onAssistantRegenerate(msg.id)
              : undefined
          }
          suppressAssistantToolbar={
            msg.role === "assistant"
              ? !assistantSegmentShowsToolbar(messages, idx)
              : undefined
          }
          onUserEdit={
            msg.role === "user" ? onUserEdit : undefined
          }
        />
      </motion.div>
    );
  }
  if (msg.type === "trace") {
    const visibleSteps = msg.steps.filter(
      (s) =>
        !(
          s.type === "tool" &&
          (s.toolName === "ask_user" ||
            (s.outputPreview ?? "").startsWith("[选择框]"))
        ),
    );
    // trace 里全是 ask_user 步骤时整块不渲染（widget 卡片已展示）
    if (visibleSteps.length === 0 && msg.status === "done") return null;
    return (
      <motion.div
        key={msg.id}
        initial={skipHistoryEnter ? false : traceEnterInitial}
        animate={{ opacity: 1, y: 0 }}
        transition={messageTransition}
      >
        <BrainstormPanel
          steps={visibleSteps}
          isStreaming={msg.status === "streaming"}
          durationSec={msg.totalDurationSec}
          collapsed={msg.collapsed}
          compactTopAfterAssistant={
            prevMsg?.type === "message" && prevMsg.role === "assistant"
          }
          onToggle={() =>
            setMessages((prev) =>
              prev.map((item) =>
                item.type === "trace" && item.id === msg.id
                  ? { ...item, collapsed: !item.collapsed }
                  : item
              )
            )
          }
        />
      </motion.div>
    );
  }
  if (msg.type === "widget") {
    // 未回答的 widget 渲染到底部覆盖层（activeWidget），
    // scroll 区内只保留一个空 div 占位以维持滚动高度
    if (!msg.answer && !msg.dismissed) {
      return <div key={msg.id} aria-hidden />;
    }
    return (
      <motion.div
        key={msg.id}
        initial={skipHistoryEnter ? false : traceEnterInitial}
        animate={{ opacity: 1, y: 0 }}
        transition={messageTransition}
      >
        <WidgetCard
          question={msg.question}
          choices={msg.choices}
          allowFreeText={msg.allowFreeText}
          answer={msg.answer}
          dismissed={msg.dismissed}
          disabled={genState !== "idle"}
          onAnswer={(ans) => onWidgetAnswer(msg.id, ans)}
        />
      </motion.div>
    );
  }
  return null;
})}
      <AnimatePresence>
        {showWaitingIndicator && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.5 }}
            animate={{ opacity: 1, height: "auto", scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.5, transition: { duration: 0 } }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8 flex justify-start overflow-hidden"
            style={{ transformOrigin: "left center" }}
          >
            <div className="flex items-center gap-2 pt-0 pb-3">
              <ClaudeStar />
              {waitingElapsedSec >= 3 && (
                <span className="text-xs tabular-nums text-gray-400">
                  {waitingElapsedSec}s
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={messagesEndRef}
        className="min-h-[min(10vh,5rem)] shrink-0 md:min-h-[min(9.5vh,5.5rem)]"
        aria-hidden
      />
    </div>
  );
}

