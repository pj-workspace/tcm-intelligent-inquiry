/**
 * @fileoverview 账户 Tab 内第三方 OAuth 绑定列表与解绑入口。
 */
"use client";

import { Link2, Shield } from "lucide-react";
import {
  type OAuthBinding,
  ProviderAvatar,
  SectionShell,
  providerDisplayName,
} from "@/components/settings/account/accountShared";

type OAuthBindingsSectionProps = {
  loading: boolean;
  bindings: OAuthBinding[];
  hasEmail: boolean;
  onUnbind: (provider: string) => void;
};

/** 已绑定 GitHub/Gitee 等第三方账号列表。 */
export function OAuthBindingsSection({
  loading,
  bindings,
  hasEmail,
  onUnbind,
}: OAuthBindingsSectionProps) {
  return (
    <SectionShell icon={Link2} title="第三方账号绑定">
      {loading ? (
        <div className="animate-pulse space-y-4">
          <div className="h-14 rounded-xl bg-muted" />
          <div className="h-14 rounded-xl bg-muted" />
        </div>
      ) : bindings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted px-4 py-8 text-center">
          <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-[13px] font-medium text-foreground">尚未绑定第三方账号</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {bindings.map((b) => {
            const canUnbind = hasEmail;
            const name = providerDisplayName(b.provider);
            return (
              <li
                key={b.provider}
                className="rounded-xl border border-card-border bg-muted/80 shadow-sm ring-1 ring-border/30"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface shadow-sm ring-1 ring-[#ededed]">
                      <ProviderAvatar avatarUrl={b.external_avatar} provider={b.provider} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
                        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-border">
                          {name}
                        </span>
                        {b.external_nickname ? (
                          <span className="truncate text-sm font-medium text-foreground">
                            {b.external_nickname}
                          </span>
                        ) : null}
                      </div>
                      {b.created_at ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          绑定于 {new Date(b.created_at).toLocaleDateString("zh-CN")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 justify-end sm:w-auto">
                    {!canUnbind ? (
                      <span className="rounded-lg bg-amber-50 px-3 py-2 text-center text-[12px] font-medium text-amber-900 ring-1 ring-amber-200/80 lg:text-left">
                        请先绑定邮箱后再解除绑定
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="shrink-0 rounded-xl border border-card-border bg-surface px-4 py-2.5 text-[13px] font-semibold text-foreground shadow-sm ring-1 ring-border/40 transition-colors hover:bg-muted sm:self-auto"
                        onClick={() => onUnbind(b.provider)}
                      >
                        解除绑定
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionShell>
  );
}
