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
          <div className="h-14 rounded-xl bg-[#f5f5f4]" />
          <div className="h-14 rounded-xl bg-[#f5f5f4]" />
        </div>
      ) : bindings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e7e5e4] bg-[#fafaf9] px-4 py-8 text-center">
          <Shield className="mx-auto mb-3 h-8 w-8 text-[#d6d3d1]" aria-hidden />
          <p className="text-[13px] font-medium text-gray-700">尚未绑定第三方账号</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {bindings.map((b) => {
            const canUnbind = hasEmail;
            const name = providerDisplayName(b.provider);
            return (
              <li
                key={b.provider}
                className="rounded-xl border border-[#eae8e3] bg-[#fafaf9]/80 shadow-sm ring-1 ring-black/[0.02]"
              >
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-[#ededed]">
                      <ProviderAvatar avatarUrl={b.external_avatar} provider={b.provider} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
                        <span className="rounded-md bg-[#fafaf9] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#78716c] ring-1 ring-[#eae8e3]">
                          {name}
                        </span>
                        {b.external_nickname ? (
                          <span className="truncate text-sm font-medium text-[#292524]">
                            {b.external_nickname}
                          </span>
                        ) : null}
                      </div>
                      {b.created_at ? (
                        <p className="mt-1 text-[11px] text-gray-500">
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
                        className="shrink-0 rounded-xl border border-[#eae8e3] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#292524] shadow-sm ring-1 ring-black/[0.03] transition-colors hover:bg-[#fafaf9] sm:self-auto"
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
