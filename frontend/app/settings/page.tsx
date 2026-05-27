/**
 * @fileoverview 设置页 Server 入口：await 动态路由参数后渲染客户端设置壳。
 */
import { Suspense } from "react";
import { SettingsPageClient } from "@/components/settings";
import { SettingsPageShellSkeleton } from "@/components/settings/shell/SettingsPageShellSkeleton";
import { parseSettingsTabId } from "@/components/settings/shell/settingsTabs";

function SettingsPageFallback() {
  return <SettingsPageShellSkeleton />;
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
