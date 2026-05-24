/**
 * @fileoverview 主聊天区消息列表：trace 与 assistant 分段布局、引用来源展示时机。
 */
"use client";

import { useEffect, useRef, useState } from "react";
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
 * 等待指示器秒数：从「首次离开 idle」开始计时，跨 thinking/tool/typing 等
 * 非 idle 状态**持续累计**，直到回到 idle 才重置为 0。
 *
 * 之前实现里 typing 也会触发重置，导致 tool→typing→tool 切换时计数清零、
 * "Ns" 标签忽闪忽现。改为只在 idle 重置后，时间标签从首达 3s 一直亮到流结束，
 * 不再随中间状态来回闪烁。
 */
function useWaitingElapsedSec(genState: GenerationState): number {
  const [elapsedSec, setElapsedSec] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (genState === "idle") {
      startRef.current = null;
      setElapsedSec(0);
      return;
    }
    // 首次进入非 idle：记下起点；后续状态切换沿用同一个起点
    if (startRef.current === null) {
      startRef.current = Date.now();
      setElapsedSec(0);
    } else {
      setElapsedSec(Math.floor((Date.now() - startRef.current) / 1000));
    }
    const start = startRef.current;
    const timer = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [genState]);
  return elapsedSec;
}

/** 主消息列表：trace/assistant 分段布局、Brainstorm 与引用展示时机。 */
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
  // 双层结构：
  // - 外层 streamActive（!== idle）控制 motion.div 的 mount/unmount——整个流式周期内常驻，
  //   ClaudeStar 旋转动画不会随中间状态切换被重启。
  // - 内层 indicatorVisible（仅 trace 阶段为 true）用 opacity 控制可见性——AI 输出正文
  //   （typing）时星星 + 计时淡出，但底层组件依然挂载，旋转保持连贯。
  // 这样既满足"只在 trace 阶段才看到星星和计时"，又避免 think 模式 thinking↔typing
  // 频繁切换让星星 mount/unmount 抽搐。
  const streamActive = genState !== "idle";
  const hasStreamingTrace = messages.some(
    (msg) => msg.type === "trace" && msg.status === "streaming",
  );
  const indicatorVisible =
    hasStreamingTrace && (genState === "tool" || genState === "thinking");

  return (
    <div className="relative pt-8">
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
    /** trace 后首段 assistant：略收紧顶距，与 trace 底部 pb-2 合计 ~14px */
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
          citations={msg.role === "assistant" ? msg.citations : undefined}
          // 生成结束后且在「该轮最终 assistant 分段」才展示引用入口，避免流式中途闪烁。
          showCitationSources={
            msg.role === "assistant" &&
            genState === "idle" &&
            assistantSegmentShowsToolbar(messages, idx)
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
          messageId={msg.role === "user" ? msg.id : undefined}
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
          aborted={msg.aborted === true}
          summaryAcknowledged={msg.summaryAcknowledged === true}
          compactTopAfterAssistant={
            prevMsg?.type === "message" && prevMsg.role === "assistant"
          }
          compactBottomBeforeAssistant={
            nextMsg?.type === "message" && nextMsg.role === "assistant"
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
    // deep think 中 ask_user 已归档为 trace 内 user_input 节点；
    // 这里的 widget 只保留给底部 activeWidget 交互入口，不在消息流里重复渲染。
    if (msg.traceId) return null;
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
        {streamActive && (
          <motion.div
            key="claude-star-indicator"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8 flex justify-start"
            style={{ transformOrigin: "left center" }}
          >
            {/* 用 min-h 把这一行的高度先撑出来：星形 1.75rem + 行间距，避免
                AnimatePresence 切换时高度跳变，进而避免外部 scroll 跟随抖动。
                内层 opacity 控制 trace/typing 切换时的可见性，ClaudeStar 始终挂载 → 旋转连贯。 */}
            <div
              className="flex min-h-[2.5rem] items-center gap-2 pt-0 pb-3"
              style={{
                opacity: indicatorVisible ? 1 : 0,
                transition: "opacity 220ms ease-out",
                pointerEvents: indicatorVisible ? "auto" : "none",
              }}
              aria-hidden={!indicatorVisible}
            >
              <ClaudeStar />
              <AnimatePresence>
                {indicatorVisible && waitingElapsedSec >= 3 && (
                  <motion.span
                    key="elapsed"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="text-xs tabular-nums text-gray-400"
                  >
                    {waitingElapsedSec}s
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        ref={messagesEndRef}
        className="min-h-[clamp(10.5rem,22vh,14rem)] shrink-0 md:min-h-[clamp(11.5rem,22vh,15rem)]"
        aria-hidden
      />
    </div>
  );
}

