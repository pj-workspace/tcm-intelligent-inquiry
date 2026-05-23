/**
 * @fileoverview 账户 Tab 共享 UI：OAuth 图标、头像、密码校验与区块壳。
 */
"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Shield } from "lucide-react";

export type OAuthBinding = {
  provider: string;
  external_nickname: string | null;
  external_avatar: string | null;
  created_at: string | null;
};

/** Gitee OAuth 品牌 SVG。 */
export function GiteeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        fill="currentColor"
        d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.15a.592.592 0 0 1-.592-.592v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296Z"
      />
    </svg>
  );
}

/** GitHub OAuth 品牌 SVG。 */
export function GitHubLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        fill="currentColor"
        d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
      />
    </svg>
  );
}

/** 第三方账号头像或首字母占位。 */
export function ProviderAvatar({
  avatarUrl,
  provider,
}: {
  avatarUrl: string | null | undefined;
  provider: string;
}) {
  const p = provider.toLowerCase();
  const url = avatarUrl?.trim();
  const isHttp = url && /^https?:\/\//i.test(url);
  if (isHttp && url) {
    return (
      // OAuth 外链头像域名各异，不适用 next/image 固定 remotePatterns
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    );
  }
  if (p === "github") {
    return <GitHubLogo className="h-7 w-7 shrink-0 text-[#181717]" />;
  }
  if (p === "gitee") {
    return <GiteeLogo className="h-7 w-7 shrink-0 text-[#C71D23]" />;
  }
  return <Shield className="h-7 w-7 shrink-0 text-stone-500" aria-hidden />;
}

/** 从显示名取最多两字符首字母。 */
export function initials(name: string) {
  const t = name.trim().slice(0, 2);
  return (t || "U").toUpperCase();
}

/** OAuth provider slug 转中文展示名。 */
export function providerDisplayName(provider: string) {
  const p = provider.toLowerCase();
  if (p === "github") return "GitHub";
  if (p === "gitee") return "Gitee";
  return provider;
}

/** 第一步：仅校验新旧密码字段（不涉及邮箱验证码）。 */
/** 修改密码：旧密码/新密码字段级校验文案。 */
export function getChangePwCredentialError(
  oldP: string,
  newP: string,
  newPwAgain: string
): string | null {
  if (!oldP || oldP.trim().length === 0) return "请填写当前密码";
  if (newP.length < 6) return "新密码至少 6 位";
  if (newP === oldP) return "新密码不能与当前密码相同";
  if (newPwAgain.length === 0) return "请再次输入新密码以确认";
  if (newP !== newPwAgain) return "两次输入的新密码不一致";
  return null;
}

/** 第二步提交：校验验证码 + 与第一步相同的密码字段。 */
/** 修改密码：表单提交前整体验证。 */
export function getChangePwFormError(
  cp: string,
  oldP: string,
  newP: string,
  newPwAgain: string
): string | null {
  const code = cp.trim();
  if (!code) return "请填写验证码";
  if (!/^[0-9]{6}$/.test(code)) return "验证码须为 6 位数字";
  if (!oldP || oldP.trim().length === 0) return "请填写当前密码";
  if (newP.length < 6) return "新密码至少 6 位";
  if (newP === oldP) return "新密码不能与当前密码相同";
  if (newPwAgain.length === 0) return "请再次输入新密码以确认";
  if (newP !== newPwAgain) return "两次输入的新密码不一致";
  return null;
}

/** 账户设置区块统一标题壳（图标 + 标题 + 内容）。 */
export function SectionShell({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#ebe8e3] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <header className="flex items-start gap-4 border-b border-[#f2f0ec] bg-gradient-to-br from-orange-50/60 via-white to-transparent px-6 py-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-orange-50 text-orange-700 shadow-inner ring-1 ring-orange-100/80">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-[15px] font-semibold tracking-tight text-[#1c1917]">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-gray-600">{description}</p>
          ) : null}
        </div>
      </header>
      <div className="px-6 py-6">{children}</div>
    </section>
  );
}
