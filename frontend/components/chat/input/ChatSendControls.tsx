"use client";

import { Send, Square } from "lucide-react";
import type { GenerationState } from "@/types/chat";

type Props = {
  genState: GenerationState;
  hasSendableContent: boolean;
  attachmentUploadBusy: boolean;
  onSend: () => void;
  onStop: () => void;
};

export function ChatSendControls({
  genState,
  hasSendableContent,
  attachmentUploadBusy,
  onSend,
  onStop,
}: Props) {
  const sendBlocked =
    !hasSendableContent || genState !== "idle" || attachmentUploadBusy;

  if (genState !== "idle") {
    return (
      <button
        type="button"
        onClick={onStop}
        title="终止输出"
        className="p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center bg-red-500 text-white hover:bg-red-600 active:scale-95"
      >
        <Square className="w-4 h-4 fill-current" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSend}
      disabled={sendBlocked}
      className={`p-1.5 rounded-lg transition-all duration-200 flex items-center justify-center ${
        hasSendableContent && genState === "idle" && !attachmentUploadBusy
          ? "bg-black text-white hover:bg-gray-800 scale-105"
          : "bg-transparent text-gray-400 hover:bg-gray-100 hover:text-gray-600 opacity-65"
      }`}
      title={
        attachmentUploadBusy
          ? "正在上传图片"
          : !hasSendableContent
            ? "输入文字或添加图片后再发送"
            : "发送"
      }
    >
      <Send className="w-4 h-4" />
    </button>
  );
}
