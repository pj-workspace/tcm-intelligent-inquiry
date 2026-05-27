/**
 * @fileoverview 附件上传中的缩略图占位与环形进度。
 */

/** 上传进度占位块： shimmer 背景 + SVG 环形百分比。 */
export function AttachmentUploadSkeletonTile({ progress }: { progress: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const pctLabel = p >= 1 ? 100 : Number((p * 100).toFixed(1));
  const r = 12.5;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - p);

  return (
    <div
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-zinc-100"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-label={`上传进度 ${pctLabel}%`}
      style={{ contain: "layout style paint" }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.85] attachment-upload-skeleton-shimmer" />
      <div className="absolute inset-0 flex items-center justify-center bg-surface/[0.28]">
        <svg
          width="52"
          height="52"
          viewBox="0 0 36 36"
          className="-rotate-90 shrink-0 text-foreground [transition:none]"
          aria-hidden
        >
          <circle cx="18" cy="18" r={r} fill="none" stroke="#e4e4e7" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="pointer-events-none absolute tabular-nums text-[11px] font-semibold leading-none tracking-tight text-foreground drop-shadow-[0_0_1px_rgba(255,255,255,0.9)]">
          {pctLabel}%
        </span>
      </div>
    </div>
  );
}
