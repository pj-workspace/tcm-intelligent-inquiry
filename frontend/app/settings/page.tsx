/**
 * @fileoverview 设置页 Server 入口：await 动态路由参数后渲染客户端设置壳。
 */
import { Suspense } from "react";
import { SettingsPageClient } from "@/components/settings";
import { SettingsTabSkeleton } from "@/components/settings/shell/SettingsTabSkeleton";
import { parseSettingsTabId } from "@/components/settings/shell/settingsTabs";

function SettingsPageFallback() {
  return (
    <div className="fixed inset-0 z-10 flex h-dvh max-h-dvh min-h-0 flex-col overflow-hidden bg-[#fdfdfc]">
      <div className="flex h-14 shrink-0 items-center border-b border-[#e5e5e5] px-4 md:px-6" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-4xl">
          <SettingsTabSkeleton />
        </div>
      </div>
    </div>
  );
}

/** 设置页：挂载 `SettingsPageClient` 处理 Tab 与数据拉取。 */
export default async function SettingsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<Record<string, string | string[] | undefined>>;
  searchParams: Promise<Record<string, string | string[] | string[][] | undefined>>;
}>) {
  const [, sp] = await Promise.all([params, searchParams]);
  const rawTab = sp.tab;
  const tabParam =
    typeof rawTab === "string"
      ? rawTab
      : Array.isArray(rawTab) && typeof rawTab[0] === "string"
        ? rawTab[0]
        : null;
  const initialTab = parseSettingsTabId(tabParam);

  return (
    <Suspense fallback={<SettingsPageFallback />}>
      <SettingsPageClient initialTab={initialTab} />
    </Suspense>
  );
}
