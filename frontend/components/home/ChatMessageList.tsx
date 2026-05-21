"use client";

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
            msg.id === lastAssistantMessageId
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
        {genState === "waiting" && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.5 }}
            animate={{ opacity: 1, height: "auto", scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.5, transition: { duration: 0 } }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8 flex justify-start overflow-hidden"
            style={{ transformOrigin: "left center" }}
          >
            <div className="py-3">
              <ClaudeStar />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={messagesEndRef}
        className="min-h-[min(8.25vh,4rem)] shrink-0 md:min-h-[min(7.5vh,4.25rem)]"
        aria-hidden
      />
    </div>
  );
}

