/**
 * @fileoverview 对话区 Client Layout：持久挂载 `HomePageClient`，与会话子路由并行渲染。
 */
"use client";

import { HomePageClient } from "@/components/home/HomePageClient";

/**
 * 对话主壳：始终渲染 `HomePageClient`（侧栏、输入区等），`children` 为 Next 占位页。
 */
export function ChatLayoutClient({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <HomePageClient />
      {children}
    </>
  );
}
