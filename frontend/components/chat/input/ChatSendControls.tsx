/**
 * @fileoverview 发送/停止按钮：随 `genState` 在 Send 与 Stop 间切换。
 */
"use client";

import { Send, Square } from "lucide-react";
import clsx from "clsx";
import type { GenerationState } from "@/types/chat";

type Props = {
  genState: GenerationState;
  hasSendableContent: boolean;
  attachmentUploadBusy: boolean;
  onSend: () => void;
  onStop: () => void;
  /** circle：元宝式圆形发送按钮 */
  variant?: "default" | "circle";
};

/** 流式生成中显示停止，否则显示发送（受内容与上传态 gate）。 */
export function ChatSendControls({
  genState,
  hasSendableContent,
  attachmentUploadBusy,
  onSend,
  onStop,
  variant = "default",
}: Props) {
  const sendBlocked =
    !hasSendableContent || genState !== "idle" || attachmentUploadBusy;
  const isCircle = variant === "circle";
  const baseCls = clsx(
    "flex items-center justify-center transition-all duration-200",
    isCircle ? "h-9 w-9 rounded-full" : "rounded-lg p-1.5",
  );

  if (genState !== "idle") {
    return (
      <button
        type="button"
        onClick={onStop}
        title="终止输出"
        className={clsx(baseCls, "bg-red-500 text-white hover:bg-red-600 active:scale-95")}
      >
        <Square className={clsx(isCircle ? "h-4 w-4" : "h-4 w-4", "fill-current")} />
      </button>
    );
  }

  const canSend =
    hasSendableContent && genState === "idle" && !attachmentUploadBusy;

  return (
    <button
      type="button"
      onClick={onSend}
      disabled={sendBlocked}
      className={clsx(
        baseCls,
        canSend
          ? isCircle
            ? "bg-primary text-primary-foreground hover:opacity-90 active:scale-95"
            : "scale-105 bg-primary text-primary-foreground hover:opacity-90"
          : isCircle
            ? "bg-muted text-muted-foreground"
            : "bg-transparent text-muted-foreground opacity-65 hover:bg-muted hover:text-muted-foreground",
      )}
      title={
        attachmentUploadBusy
          ? "正在上传图片"
          : !hasSendableContent
            ? "输入文字或添加图片后再发送"
            : "发送"
      }
    >
      <Send className={isCircle ? "h-4 w-4" : "h-4 w-4"} />
    </button>
  );
}
