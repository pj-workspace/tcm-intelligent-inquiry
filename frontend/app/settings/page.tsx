/**
 * @fileoverview 设置页 Server 入口：await 动态路由参数后渲染客户端设置壳。
 */
import { SettingsPageClient } from "@/components/settings";

/** 设置页：挂载 `SettingsPageClient` 处理 Tab 与数据拉取。 */
export default async function SettingsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<Record<string, string | string[] | undefined>>;
  searchParams: Promise<Record<string, string | string[] | string[][] | undefined>>;
}>) {
  await Promise.all([params, searchParams]);
  return <SettingsPageClient />;
}
