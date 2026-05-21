"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AppLogo } from "@/components/brand/AppLogo";
import {
  Plus,
  Edit2,
  Trash2,
  Download,
  MoreVertical,
  LogOut,
  PanelLeftOpen,
  FolderOpen,
  ArrowLeft,
} from "lucide-react";
import type { ServerConversation } from "@/types/chat";
import type { ChatSurfacePhase } from "@/types/chat-ui";
import { uiDropdownBelow } from "@/lib/ui-motion";

type ChatHeaderProps = {
  token: string | null;
  authLoading: boolean;
  chatSurfacePhase?: ChatSurfacePhase;
  /** 分组工作台：顶部显示文件夹标题，不传 conversation 菜单 */
  groupWorkspaceTitle?: string | null;
  hasStarted: boolean;
  conversationId: string | null;
  serverConversations: ServerConversation[];
  sidebarCollapsed: boolean;
  isGeneratingTitle: boolean;
  isEditingTitle: boolean;
  editTitleValue: string;
  headerMenuOpen: boolean;
  headerMenuRef: React.RefObject<HTMLDivElement | null>;
  showMobileTitleSkeleton: boolean;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  onSetHeaderMenuOpen: (open: boolean) => void;
  onEditTitle: () => void;
  onExportHistory: () => void;
  onDeleteConversation: () => void;
  onEditTitleChange: (value: string) => void;
  onEditTitleBlur: () => void;
  onEditTitleKeyDown: (e: React.KeyboardEvent) => void;
  onLogout: () => void;
  /** 当前会话属于选中侧栏分组时显示，返回分组管理工作台（有分组面包屑时不再显示） */
  showBackToGroupWorkspace?: boolean;
  onBackToGroupWorkspace?: () => void;
  /** 会话在分组内时：顶栏「分组名 / 标题」，点击分组名回到分组工作台 */
  conversationGroupTrail?: {
    groupName: string;
    onGroupClick: () => void;
  } | null;
};

export function ChatHeader({
  token,
  authLoading,
  chatSurfacePhase = "ready",
  groupWorkspaceTitle,
  hasStarted,
  conversationId,
  serverConversations,
  sidebarCollapsed,
  isGeneratingTitle,
  isEditingTitle,
  editTitleValue,
  headerMenuOpen,
  headerMenuRef,
  showMobileTitleSkeleton,
  onToggleSidebar,
  onNewChat,
  onSetHeaderMenuOpen,
  onEditTitle,
  onExportHistory,
  onDeleteConversation,
  onEditTitleChange,
  onEditTitleBlur,
  onEditTitleKeyDown,
  onLogout,
  showBackToGroupWorkspace,
  onBackToGroupWorkspace,
  conversationGroupTrail,
}: ChatHeaderProps) {
  const currentTitle = serverConversations.find((c) => c.id === conversationId)?.title;
  const showGroupBanner = !!groupWorkspaceTitle?.trim();
  const showConvBreadcrumb = Boolean(
    conversationGroupTrail && hasStarted && conversationId
  );

  return (
    <header className="z-10 flex h-14 flex-shrink-0 items-center justify-between bg-white/80 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-1 min-w-0 flex-1 md:flex-initial">
        {/* 移动端：分组内会话显示「分组/标题」面包屑 */}
        <div className="flex min-w-0 flex-1 items-center gap-2 shrink-0 md:hidden">
          <AppLogo size={28} className="shrink-0 rounded-md ring-1 ring-black/[0.06]" />
          {showConvBreadcrumb && conversationGroupTrail ? (
            <nav
              className="flex min-w-0 flex-1 items-center gap-1 text-xs font-medium leading-snug text-gray-800"
              aria-label="会话位置"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-800/85" aria-hidden />
              <button
                type="button"
                title="回到分组管理"
                onClick={conversationGroupTrail.onGroupClick}
                className="max-w-[38%] min-w-0 shrink truncate text-left text-gray-900 hover:text-gray-950 hover:underline"
              >
                {conversationGroupTrail.groupName}
              </button>
              <span className="shrink-0 text-gray-300" aria-hidden>
                /
              </span>
              {isEditingTitle ? (
                <input
                  autoFocus
                  className="h-7 min-w-0 flex-1 rounded border border-gray-300 px-2 text-xs font-medium outline-none focus:border-orange-400"
                  value={editTitleValue}
                  onChange={(e) => onEditTitleChange(e.target.value)}
                  onBlur={onEditTitleBlur}
                  onKeyDown={onEditTitleKeyDown}
                />
              ) : isGeneratingTitle ? (
                <span className="min-w-0 flex-1">
                  <span className="skeleton-text-shimmer inline-block h-3.5 w-24 rounded" aria-hidden />
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate">{currentTitle || "会话记录"}</span>
              )}
            </nav>
          ) : (
            <>
              <span className="shrink-0 font-semibold text-sm">中医智询</span>
              {showBackToGroupWorkspace && onBackToGroupWorkspace && (
                <button
                  type="button"
                  title="返回分组管理"
                  aria-label="返回分组管理"
                  onClick={onBackToGroupWorkspace}
                  className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 -ml-0.5 transition-colors"
                >
                  <ArrowLeft className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.25} />
                </button>
              )}
            </>
          )}
        </div>

        {!showGroupBanner && showMobileTitleSkeleton && !showConvBreadcrumb && (
          <div
            className="md:hidden flex-1 min-w-0 max-w-[15rem] flex items-center"
            aria-busy
            aria-label="正在加载会话标题"
          >
            <div className="skeleton-text-shimmer h-4 w-32 rounded-md" />
          </div>
        )}

        {/* 分组工作台标题：移动端始终在品牌行后；桌面端侧栏展开时单独占左区 */}
        {showGroupBanner && (
          <div className="md:hidden flex min-w-0 flex-1 items-center gap-1.5 pr-2">
            <FolderOpen className="h-[1.125rem] w-[1.125rem] shrink-0 text-amber-800/85" aria-hidden />
            <span className="truncate text-sm font-medium text-gray-800">{groupWorkspaceTitle}</span>
          </div>
        )}
        {showGroupBanner && !sidebarCollapsed && (
          <div className="hidden md:flex items-center gap-2 min-w-0 max-w-[28rem]">
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-800/80" aria-hidden />
            <span className="truncate text-sm font-medium text-gray-800">{groupWorkspaceTitle}</span>
          </div>
        )}

        {/* 侧栏收起时：展开 + 新建 + 竖线；分组工作台时文件夹标题在竖线右侧（与聊天区标题区对齐） */}
        {sidebarCollapsed && (
          <div className="hidden md:flex items-center gap-0.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={onToggleSidebar}
              title="展开侧栏"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <PanelLeftOpen className="w-[1.05rem] h-[1.05rem]" />
            </button>
            <button
              type="button"
              onClick={onNewChat}
              title="新建会话"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <Plus className="w-[1.05rem] h-[1.05rem]" />
            </button>
            <div className="mx-1 h-4 w-px shrink-0 bg-gray-200" aria-hidden />
            {showGroupBanner && (
              <div className="flex max-w-[28rem] min-w-0 flex-1 items-center gap-2 pl-0.5">
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-800/80" aria-hidden />
                <span className="truncate text-sm font-medium text-gray-800">{groupWorkspaceTitle}</span>
              </div>
            )}
            {/* 分组会话：面包屑跟在竖线后与主标题区对齐 */}
            {!showGroupBanner &&
              showConvBreadcrumb &&
              conversationGroupTrail &&
              hasStarted &&
              conversationId && (
                <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-0.5">
                  <FolderOpen className="h-4 w-4 shrink-0 text-amber-800/80" aria-hidden />
                  <button
                    type="button"
                    title="回到分组管理"
                    onClick={conversationGroupTrail.onGroupClick}
                    className="max-w-[10rem] shrink-0 truncate text-left text-sm font-medium text-gray-800 hover:text-gray-900 hover:underline"
                  >
                    {conversationGroupTrail.groupName}
                  </button>
                  <span className="shrink-0 text-gray-300" aria-hidden>
                    /
                  </span>
                  <div className="flex min-h-8 min-w-0 flex-1 items-center text-sm font-medium text-gray-800">
                    {isEditingTitle ? (
                      <input
                        autoFocus
                        className="h-8 w-full box-border rounded border border-gray-300 px-2 text-sm font-medium outline-none focus:border-orange-400"
                        value={editTitleValue}
                        onChange={(e) => onEditTitleChange(e.target.value)}
                        onBlur={onEditTitleBlur}
                        onKeyDown={onEditTitleKeyDown}
                      />
                    ) : isGeneratingTitle ? (
                      <span
                        className="block w-full select-none leading-snug text-transparent"
                        aria-hidden
                      >
                        &nbsp;
                      </span>
                    ) : (
                      <span
                        key={currentTitle || "会话记录"}
                        className="sidebar-conv-title-sweep block w-full truncate leading-snug font-medium"
                      >
                        {currentTitle || "会话记录"}
                      </span>
                    )}
                  </div>
                </div>
              )}
          </div>
        )}

        {/* 会话标题（md+）：侧栏收起且为分组会话时，面包屑已出现在上一行收起条内，此处省略 */}
        {!showGroupBanner &&
          hasStarted &&
          conversationId &&
          (!sidebarCollapsed || !showConvBreadcrumb) && (
          <div className="hidden max-w-[28rem] min-w-0 items-center gap-1.5 md:flex">
            {showConvBreadcrumb && conversationGroupTrail ? (
              <>
                <FolderOpen className="h-4 w-4 shrink-0 text-amber-800/80" aria-hidden />
                <button
                  type="button"
                  title="回到分组管理"
                  onClick={conversationGroupTrail.onGroupClick}
                  className="max-w-[11rem] shrink-0 truncate text-left text-sm font-medium text-gray-800 hover:text-gray-900 hover:underline"
                >
                  {conversationGroupTrail.groupName}
                </button>
                <span className="shrink-0 text-gray-300 select-none" aria-hidden>
                  /
                </span>
                <div className="flex min-h-8 min-w-0 flex-1 items-center text-sm font-medium text-gray-800">
                  {isEditingTitle ? (
                    <input
                      autoFocus
                      className="h-8 w-full box-border rounded border border-gray-300 px-2 text-sm font-medium outline-none focus:border-orange-400"
                      value={editTitleValue}
                      onChange={(e) => onEditTitleChange(e.target.value)}
                      onBlur={onEditTitleBlur}
                      onKeyDown={onEditTitleKeyDown}
                    />
                  ) : isGeneratingTitle ? (
                    <span className="block w-full select-none leading-snug text-transparent" aria-hidden>
                      &nbsp;
                    </span>
                  ) : (
                    <span
                      key={currentTitle || "会话记录"}
                      className="sidebar-conv-title-sweep block w-full truncate leading-snug font-medium"
                    >
                      {currentTitle || "会话记录"}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                {showBackToGroupWorkspace && onBackToGroupWorkspace && (
                  <button
                    type="button"
                    title="返回分组管理"
                    aria-label="返回分组管理"
                    onClick={() => {
                      onBackToGroupWorkspace();
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  >
                    <ArrowLeft className="h-[1.1rem] w-[1.1rem]" strokeWidth={2.25} />
                  </button>
                )}
                <div className="flex min-h-8 min-w-0 flex-1 items-center text-sm font-medium text-gray-800">
                  {isEditingTitle ? (
                    <input
                      autoFocus
                      className="h-8 w-full box-border rounded border border-gray-300 px-2 text-sm font-medium outline-none focus:border-orange-400"
                      value={editTitleValue}
                      onChange={(e) => onEditTitleChange(e.target.value)}
                      onBlur={onEditTitleBlur}
                      onKeyDown={onEditTitleKeyDown}
                    />
                  ) : isGeneratingTitle ? (
                    <span className="block w-full select-none leading-snug text-transparent" aria-hidden>
                      &nbsp;
                    </span>
                  ) : (
                    <span
                      key={currentTitle || "会话记录"}
                      className="sidebar-conv-title-sweep block w-full truncate leading-snug font-medium"
                    >
                      {currentTitle || "会话记录"}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 md:gap-3">
        {!showGroupBanner && hasStarted && conversationId && (
          <div className="relative" ref={headerMenuRef}>
            <button
              onClick={() => onSetHeaderMenuOpen(!headerMenuOpen)}
              className="p-1.5 rounded-md hover:bg-gray-100 hover:text-gray-900 text-gray-600 active:scale-95 transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {headerMenuOpen && (
                <motion.div
                  key="chat-header-conv-menu"
                  style={{ transformOrigin: "top right" }}
                  className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-[#e5e5e5] bg-white py-1 shadow-lg z-50"
                  {...uiDropdownBelow}
                >
                  <button
                    onClick={onEditTitle}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100/80"
                  >
                    <Edit2 className="w-4 h-4" /> 编辑标题
                  </button>
                  <button
                    onClick={onExportHistory}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100/80"
                  >
                    <Download className="w-4 h-4" /> 导出会话
                  </button>
                  <div className="my-1 border-t border-gray-100" />
                  <button
                    onClick={onDeleteConversation}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 active:bg-red-100/60"
                  >
                    <Trash2 className="w-4 h-4" /> 删除会话
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* 移动端新建会话按钮 */}
        <button
          type="button"
          onClick={onNewChat}
          className="p-2 md:hidden text-gray-600 hover:bg-gray-100 hover:text-gray-800 active:scale-95 rounded-md transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>

        {/* 用户菜单 */}
        {authLoading ? (
          <div className="h-8 w-8 md:h-9 md:w-9 rounded-full bg-gray-200/70 animate-pulse" aria-hidden />
        ) : token ? (
          <div className="relative group">
            <button
              type="button"
              className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-full bg-white border border-[#e5e5e5] shadow-sm hover:bg-gray-50 hover:border-gray-300 active:scale-95 transition-colors"
              aria-label="账户"
            >
              <span className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                P
              </span>
            </button>
            {/* pt-2 为头像到面板的 hover 桥；外层默认 pointer-events-none，避免透明区域挡住左侧会话菜单 */}
            <div className="absolute right-0 top-full z-50 flex justify-end pt-2 pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto">
              <div className="w-32 origin-top-right rounded-lg border border-[#e5e5e5] bg-white py-1 shadow-lg opacity-0 scale-[0.98] translate-y-[-6px] pointer-events-none invisible transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 group-hover:visible group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:translate-y-0 group-focus-within:visible group-focus-within:pointer-events-auto">
                <button
                  type="button"
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 active:bg-red-100/50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/login"
              className="text-sm text-gray-600 px-2 py-1 md:px-3 md:py-1.5 rounded-md hover:bg-gray-100"
            >
              登录
            </Link>
            <Link
              href="/register"
              className="text-sm text-gray-500 px-2 py-1 md:px-3 md:py-1.5 rounded-md hover:bg-gray-100"
            >
              注册
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
