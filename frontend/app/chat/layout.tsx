/**
 * @fileoverview 对话区 Server Layout：挂载持久化 Client Shell，子路由仅占位。
 */
import { ChatLayoutClient } from "./chat-layout-client";

/** 持久 Client Shell：子 route 仅占位，避免切换会话时整页 remount 丢失输入区状态 */
export default function ChatLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ChatLayoutClient>{children}</ChatLayoutClient>;
}
