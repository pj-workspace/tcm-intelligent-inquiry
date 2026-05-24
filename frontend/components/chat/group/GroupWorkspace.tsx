/**
 * @fileoverview 分组工作台主区：选中侧栏分组且未打开具体会话时的 landing 视图。
 */
"use client";

import { Folder, FolderOpen } from "lucide-react";
import type { ServerConversation } from "@/types/chat";

export type GroupWorkspaceProps = {
  groupName: string;
  conversationsInGroup: ServerConversation[];
  onOpenConversation: (id: string) => void;
};

/**
 * 侧栏选中某分组且未打开具体会话时的主区：对齐「文件夹工作台」类产品（大号标题 + 能力卡片 + 组内列表）。
 */
export function GroupWorkspace({
  groupName,
  conversationsInGroup,
  onOpenConversation,
}: GroupWorkspaceProps) {
  const n = conversationsInGroup.length;

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-y-auto no-scrollbar px-4 md:px-8">
      <div className="mx-auto w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl pb-8 pt-6 md:pt-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
          <div className="flex h-[3.5rem] w-[3.5rem] shrink-0 items-center justify-center rounded-2xl border border-[#e5e5e5] bg-white shadow-sm">
            <Folder className="h-8 w-8 text-amber-800/85" strokeWidth={1.35} aria-hidden />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1 className="truncate text-xl font-semibold tracking-tight text-gray-900 md:text-2xl">
              {groupName}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              在底部输入框发送消息即可在本分组新建会话；亦可从侧栏将历史会话移入本分组。
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled
            className="rounded-xl border border-[#ebebeb] bg-white p-4 text-left opacity-[0.92] shadow-[0_1px_0_rgba(0,0,0,0.03)]"
          >
            <div className="text-sm font-medium text-gray-800">添加指令</div>
            <div className="mt-1 text-xs leading-relaxed text-gray-400">
              定制该分组下的系统提示（后续版本）
            </div>
          </button>
          <button
            type="button"
            disabled
            className="rounded-xl border border-[#ebebeb] bg-white p-4 text-left opacity-[0.92] shadow-[0_1px_0_rgba(0,0,0,0.03)]"
          >
            <div className="text-sm font-medium text-gray-800">资料库</div>
            <div className="mt-1 text-xs leading-relaxed text-gray-400">
              为分组挂载知识片段（后续版本）
            </div>
          </button>
        </div>

        <section className="mt-12">
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-gray-400">
            组内对话 · {n}
          </h2>
          {n === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200/90 bg-[#fafaf9]/80 px-6 py-20 text-center">
              <FolderOpen
                className="mb-3 h-10 w-10 text-gray-300"
                strokeWidth={1.2}
                aria-hidden
              />
              <p className="max-w-[20rem] text-sm leading-relaxed text-gray-500">
                发送消息新建对话，或将侧栏中的历史会话移入本分组。
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {conversationsInGroup.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onOpenConversation(c.id)}
                    className="flex w-full min-h-[3rem] items-center justify-between gap-3 rounded-xl border border-transparent bg-white px-4 py-3 text-left text-sm font-medium text-gray-800 shadow-sm ring-1 ring-[#e8e8e8] transition hover:bg-gray-50/90 hover:ring-gray-300/80"
                  >
                    <span className="truncate">{c.title?.trim() || "未命名"}</span>
                    <span className="shrink-0 text-xs text-gray-400">打开</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
