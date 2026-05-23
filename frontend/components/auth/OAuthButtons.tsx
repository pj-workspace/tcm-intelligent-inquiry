/**
 * @fileoverview OAuth 第三方登录按钮组（GitHub / Gitee）。
 */
"use client";

import { OAuthIconGitee, OAuthIconGitHub } from "@/components/auth/OAuthIcons";

type OAuthButtonsProps = {
  compact?: boolean;
  onGitHub: () => void;
  onGitee: () => void;
};

/** GitHub / Gitee 并排 OAuth 入口，样式随 `compact` 微调间距。 */
export function OAuthButtons({ compact, onGitHub, onGitee }: OAuthButtonsProps) {
  return (
    <div
      className={`border-t border-[#eae8e4] ${
        compact ? "space-y-3 pt-4" : "space-y-3 pt-5"
      }`}
    >
      <p className="text-center text-[11px] font-medium uppercase tracking-wide text-[#b4b4b9]">
        第三方账号
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onGitHub}
          className={`flex items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] bg-white text-sm font-medium text-[#374151] shadow-sm hover:bg-[#fafafa] ${compact ? "py-2" : "py-2.5"}`}
        >
          <OAuthIconGitHub />
          GitHub
        </button>
        <button
          type="button"
          onClick={onGitee}
          className={`flex items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] bg-white text-sm font-medium text-[#C71D23] shadow-sm hover:bg-orange-50/50 ${compact ? "py-2" : "py-2.5"}`}
        >
          <OAuthIconGitee />
          Gitee
        </button>
      </div>
    </div>
  );
}
