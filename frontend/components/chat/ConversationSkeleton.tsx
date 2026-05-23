/**
 * @fileoverview 深链恢复会话时主区骨架屏，避免闪欢迎页。
 */
"use client";

/** 深链恢复会话时主区占位，避免闪欢迎页 */
export function ConversationSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl space-y-8 px-4 pt-8 pb-4 md:max-w-4xl md:px-6 lg:max-w-5xl"
      aria-busy
      aria-label="正在加载对话"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-3">
          <div className="flex justify-end">
            <div className="skeleton-text-shimmer h-10 w-[min(72%,18rem)] rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <div className="skeleton-text-shimmer h-24 w-[min(88%,28rem)] rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}
