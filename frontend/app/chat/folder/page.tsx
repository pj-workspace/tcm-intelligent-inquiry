/**
 * @fileoverview 分组索引路由：缺少 `groupId` 时回退至 `/chat`。
 */
import { redirect } from "next/navigation";

/** /chat/folder 缺少 groupId */
export default function ChatFolderIndexPage() {
  redirect("/chat");
}
