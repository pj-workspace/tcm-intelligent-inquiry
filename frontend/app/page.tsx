/**
 * @fileoverview 根路径占位页：将 `/` 重定向至主对话路由 `/chat`。
 */
import { redirect } from "next/navigation";

/**
 * 应用入口统一到 /chat（next.config 亦有 `/` → `/chat` redirect，双保险）。
 */
export default function RootPage() {
  redirect("/chat");
}
