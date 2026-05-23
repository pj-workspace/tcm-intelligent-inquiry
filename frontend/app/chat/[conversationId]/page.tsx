/**
 * @fileoverview 单会话动态路由占位：实际 UI 由 layout 内 `HomePageClient` + pathname 驱动。
 */

/**
 * 路由占位：会话内容由 layout 内 HomePageClient + pathname 驱动。
 */
export default async function ChatConversationPage({
  params,
}: Readonly<{
  params: Promise<{ conversationId: string }>;
}>) {
  await params;
  return null;
}
