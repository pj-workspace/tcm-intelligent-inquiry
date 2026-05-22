"use client";

import { useCallback, useState } from "react";
import clsx from "clsx";
import { Copy, Check, Pencil } from "lucide-react";
import { ImagePreviewLightbox } from "./ImagePreviewLightbox";

interface UserBubbleProps {
  content: string;
  imageUrls?: string[];
  copied: boolean;
  onCopy: () => void;
  onEdit?: (text: string, imageUrls?: string[]) => void;
  /** 消息 id；用于发送后把对应气泡滚到 viewport 顶部（HomePageClient 通过 querySelector 定位） */
  messageId?: string;
}

/** 多图时气泡外横排缩略图格数；第 4 格叠「+N」表示其余张数 */
const MULTI_GRID_SLOTS = 4;

function UserBubbleAttachments({
  urls,
  onOpenPreview,
}: {
  urls: string[];
  onOpenPreview: (i: number) => void;
}) {
  const n = urls.length;
  if (n === 0) return null;

  if (n === 1) {
    const u = urls[0];
    return (
      <div className="flex min-w-0 justify-end">
        <button
          type="button"
          onClick={() => onOpenPreview(0)}
          className={clsx(
            "group/img relative block h-28 w-28 max-w-[min(100%,7rem)] shrink-0 overflow-hidden rounded-xl sm:h-32 sm:w-32 sm:max-w-[8rem]",
            "bg-white text-left shadow-sm ring-1 ring-black/[0.08] transition-[box-shadow,ring-color]",
            "hover:ring-black/14 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/80"
          )}
          aria-label="查看大图"
          title="查看大图"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 动态 OSS 签名 URL */}
          <img
            src={u}
            alt=""
            className="h-full w-full object-cover object-center"
            loading="lazy"
            draggable={false}
          />
          <span className="pointer-events-none absolute inset-0 rounded-xl bg-black/0 transition-colors group-hover/img:bg-black/[0.03]" />
        </button>
      </div>
    );
  }

  const folded = n > MULTI_GRID_SLOTS;
  const slotCount = folded ? MULTI_GRID_SLOTS : n;
  /** 第 4 格仍展示第 4 张缩略图，+N = 其后未在格内展示的剩余张数（n − 前 4 张） */
  const plusOverlayCount = folded ? n - MULTI_GRID_SLOTS : 0;

  return (
    <div className="flex min-w-0 justify-end">
      <div className="no-scrollbar flex max-w-full flex-nowrap justify-end gap-2 overflow-x-auto pb-0.5">
        {Array.from({ length: slotCount }, (_, slot) => {
          const showPlusBadge = folded && slot === MULTI_GRID_SLOTS - 1;
          const u = urls[slot];

          return (
            <button
              key={`${slot}-${u.slice(0, 48)}`}
              type="button"
              onClick={() =>
                showPlusBadge ? onOpenPreview(MULTI_GRID_SLOTS - 1) : onOpenPreview(slot)
              }
              className={clsx(
                "group/img relative h-[3.625rem] w-[3.625rem] shrink-0 overflow-hidden rounded-xl sm:h-16 sm:w-16",
                "bg-white/80 shadow-sm ring-1 ring-black/[0.06] transition-[box-shadow,ring-color]",
                "hover:ring-black/12 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/80"
              )}
              aria-label={
                showPlusBadge && plusOverlayCount > 0
                  ? `查看图片，还有 ${plusOverlayCount} 张`
                  : `查看第 ${slot + 1} 张`
              }
              title={showPlusBadge ? `共 ${n} 张，点击查看` : "查看大图"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 动态 OSS 签名 URL */}
              <img
                src={u}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                draggable={false}
              />
              {showPlusBadge && plusOverlayCount > 0 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/52 text-[15px] font-semibold tabular-nums text-white backdrop-blur-[1px] sm:text-base">
                  +{plusOverlayCount}
                </span>
              ) : (
                <span className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover/img:bg-black/[0.05]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function UserBubble({ content, imageUrls, copied, onCopy, onEdit, messageId }: UserBubbleProps) {
  const hasImages = Boolean(imageUrls && imageUrls.length > 0);
  const text = content?.trim() ?? "";
  const hasText = Boolean(text);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const closeLightbox = useCallback(() => setLightboxIndex(null), []);

  return (
    <div
      data-msg-id={messageId}
      className={clsx(
        "flex w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto py-4 px-4 sm:px-5 md:px-6 lg:px-8",
        "justify-end"
      )}
    >
      {hasImages && imageUrls ? (
        <ImagePreviewLightbox
          urls={imageUrls}
          index={lightboxIndex}
          onClose={closeLightbox}
          onIndexChange={setLightboxIndex}
        />
      ) : null}

      <div className="group flex min-w-0 max-w-[88%] flex-col items-end gap-2 sm:max-w-[min(76%,34rem)] md:max-w-[min(70%,36rem)]">
        {hasImages && imageUrls ? (
          <div className="flex w-full justify-end">
            <UserBubbleAttachments urls={imageUrls} onOpenPreview={setLightboxIndex} />
          </div>
        ) : null}

        <div className="flex w-full flex-row-reverse items-start gap-2">
          {hasText ? (
            <div
              className={clsx(
                "min-w-0 max-w-full text-[15px] leading-relaxed break-words [overflow-wrap:anywhere]",
                "rounded-3xl rounded-tr-sm bg-[#f4f4f4] px-4 py-3 text-[#1a1a1a] sm:px-5 sm:py-3.5"
              )}
            >
              {text}
            </div>
          ) : null}

          <div
            className="flex flex-row items-center gap-0.5 pt-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-150 shrink-0"
            aria-hidden
          >
            <button
              type="button"
              onClick={onCopy}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-black/5 transition-colors"
              title={copied ? "已复制" : "复制"}
              aria-label={copied ? "已复制" : "复制"}
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" strokeWidth={1.75} />
              ) : (
                <Copy className="w-4 h-4" strokeWidth={1.75} />
              )}
            </button>
            <button
              type="button"
              onClick={() => onEdit?.(content, imageUrls)}
              className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-black/5 transition-colors"
              title="填入输入框编辑"
              aria-label="填入输入框编辑"
            >
              <Pencil className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
