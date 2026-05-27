/**
 * @fileoverview 待发送图片缩略图条与添加入口（含上传骨架占位）。
 */
"use client";

import { Plus, X } from "lucide-react";
import type { GenerationState } from "@/types/chat";
import { CHAT_PENDING_ATTACHMENT_MAX } from "@/lib/chatAttachmentConstants";
import { AttachmentUploadSkeletonTile } from "@/components/chat/input/AttachmentUploadSkeletonTile";

type ChatAttachmentPanelProps = {
  pendingImageUrls: string[];
  attachmentUploadBusy: boolean;
  attachmentUploadSkeletonCount: number;
  attachmentUploadSlotProgress: number[];
  attachmentDisabled: boolean;
  attachmentDisabledReason?: string;
  attachmentAtCap: boolean;
  genState: GenerationState;
  onRemovePendingImage: (index: number) => void;
  onAddImageClick: () => void;
};

/** 输入框上方待发送附件预览与添加按钮。 */
export function ChatAttachmentPanel({
  pendingImageUrls,
  attachmentUploadBusy,
  attachmentUploadSkeletonCount,
  attachmentUploadSlotProgress,
  attachmentDisabled,
  attachmentDisabledReason,
  attachmentAtCap,
  genState,
  onRemovePendingImage,
  onAddImageClick,
}: ChatAttachmentPanelProps) {
  if (
    pendingImageUrls.length === 0 &&
    attachmentUploadSkeletonCount === 0 &&
    !attachmentUploadBusy
  ) {
    return null;
  }

  return (
    <div className="space-y-2 border-b border-border px-3 py-2 sm:px-4 sm:py-2.5">
      {(pendingImageUrls.length > 0 ||
        (attachmentUploadBusy && attachmentUploadSkeletonCount > 0)) && (
        <div className="flex flex-wrap gap-2">
          {pendingImageUrls.map((url, i) => (
            <div key={`${i}-${url.slice(0, 48)}`} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 动态 OSS URL */}
              <img
                src={url}
                alt=""
                className="h-16 w-16 rounded-xl border border-border bg-muted object-cover"
              />
              <button
                type="button"
                onClick={() => onRemovePendingImage(i)}
                disabled={attachmentUploadBusy}
                title="移除"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-90 shadow transition-opacity hover:opacity-100 disabled:opacity-40"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
              </button>
            </div>
          ))}
          {attachmentUploadBusy &&
            attachmentUploadSkeletonCount > 0 &&
            Array.from({ length: attachmentUploadSkeletonCount }).map((_, i) => (
              <AttachmentUploadSkeletonTile
                key={`sk-${i}`}
                progress={attachmentUploadSlotProgress[i] ?? 0}
              />
            ))}
          <button
            type="button"
            disabled={
              attachmentDisabled ||
              genState !== "idle" ||
              attachmentUploadBusy ||
              attachmentAtCap
            }
            onClick={onAddImageClick}
            title={
              attachmentDisabled
                ? attachmentDisabledReason ?? "当前模型不支持接收图片输入"
                : attachmentAtCap
                  ? `最多 ${CHAT_PENDING_ATTACHMENT_MAX} 个附件`
                  : attachmentUploadBusy
                    ? "正在上传图片…"
                    : "继续添加图片"
            }
            aria-label="继续添加图片"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:bg-muted disabled:hover:text-muted-foreground"
          >
            <Plus className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
      )}
      {attachmentAtCap && !attachmentUploadBusy ? (
        <p className="text-[11px] text-muted-foreground">
          已达本次发送上限（{CHAT_PENDING_ATTACHMENT_MAX} 个）
        </p>
      ) : null}
    </div>
  );
}
