"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown } from "lucide-react";
import {
  ChatHeader,
  ChatInputBar,
  ConversationSearchModal,
  GroupWorkspace,
  Sidebar,
} from "@/components/chat";
import type { SidebarFilter } from "@/components/chat/sidebar/Sidebar";
import { WidgetCard } from "@/components/chat/messages/WidgetCard";
import { ChatMessageList } from "@/components/home/ChatMessageList";
import { ChatWorkspaceModals } from "@/components/home/ChatWorkspaceModals";
import { useAuth } from "@/contexts/auth-context";
import { API_BASE } from "@/lib/api";
import { downloadConversationMarkdown } from "@/lib/conversation-export";
import { conversationToMarkdown, sanitizeDownloadBasename } from "@/lib/chatUtils";
import { useScrollBehavior } from "@/hooks/useScrollBehavior";
import { PENDING_CHAT_DRAFT_KEY } from "@/hooks/chat/chatHelpers";
import { useChat } from "@/hooks/useChat";
import { useChatAgentsCatalog } from "@/hooks/useChatAgentsCatalog";
import type { Message, ServerConversation, WidgetMessage } from "@/types/chat";
import { ConversationSkeleton } from "@/components/chat/ConversationSkeleton";
import { WelcomeHero } from "./WelcomeHero";
import {
  chatPathConversation,
  chatPathFolder,
  chatPathNew,
  parseChatPathname,
} from "@/lib/chatRoutes";

export function HomePageClient() {
  const { token, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [input, setInput] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>(() => {
    const parsed = parseChatPathname(pathname);
    return parsed.kind === "folder" ? parsed.groupId : "__ungrouped__";
  });
  const [sidebarBatchMode, setSidebarBatchMode] = useState(false);
  const [sidebarSelectedIds, setSidebarSelectedIds] = useState<Set<string>>(() => new Set());

  const [renameConvModal, setRenameConvModal] = useState<{ id: string; draft: string } | null>(
    null
  );
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupNameDraft, setNewGroupNameDraft] = useState("");
  const [renameFolderModal, setRenameFolderModal] = useState<{ id: string; draft: string } | null>(
    null
  );
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<{ id: string; name: string } | null>(
    null
  );

  const headerMenuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasStartedRef = useRef(false);

  const {
    scrollViewportRef,
    messagesEndRef,
    autoFollowMainRef,
    showScrollToBottom,
    updateScrollState,
    scrollToBottom,
    resetScrollState,
  } = useScrollBehavior(hasStartedRef);

  const getPreferredGroupForNewConversation = useCallback((): string | null => {
    if (sidebarFilter === "__ungrouped__") return null;
    return sidebarFilter;
  }, [sidebarFilter]);

  const onNavigateToNewChatSurface = useCallback(() => {
    if (sidebarFilter === "__ungrouped__") router.push(chatPathNew());
    else router.push(chatPathFolder(sidebarFilter));
  }, [router, sidebarFilter]);

  const chat = useChat({
    autoFollowMainRef,
    onNewChatScrollReset: resetScrollState,
    getPreferredGroupForNewConversation,
    chatPathname: pathname,
    onNavigateToNewChatSurface,
  });

  const {
    messages,
    setMessages,
    hasStarted,
    chatSurfacePhase,
    urlConversationId,
    conversationRouteSynced,
    messagesLoading,
    listLoading,
    genState,
    conversationId,
    inputBarUsageHint,
    serverConversations,
    conversationFolders,
    pinnedIds,
    isGeneratingTitle,
    lastAssistantMessageId,
    followUpSuggestions,
    deleteTargetId,
    deletePending,
    bulkDeletePending,
    movePendingId,
    deepThinkEnabled,
    setDeepThinkEnabled,
    webSearchEnabled,
    setWebSearchEnabled,
    webSearchMode,
    setWebSearchMode,
    chatModelCatalog,
    chatAgentId,
    setChatAgentId,
    selectedProviderId,
    selectedChatModelId,
    setModelPick,
    pendingImageUrls,
    attachmentUploadBusy,
    attachmentUploadSkeletonCount,
    attachmentUploadSlotProgress,
    pushImageAttachments,
    removePendingImageUrlAt,
    applyComposerAttachmentsFromUserMessage,
    fetchAiImageQuickPrompts,
    handleStop,
    handleRegenerateAssistant,
    handleWidgetAnswer,
    handleNewChat,
    handleSelectConversation,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDeleteConversation,
    refreshServerConversations,
    moveConversationToGroup,
    createFolder,
    renameFolder,
    deleteFolder,
    togglePinConversation,
    deleteConversationsBulk,
    sseRouteAssignPending,
  } = chat;

  const { agents: agentCatalog, loading: agentsLoading } = useChatAgentsCatalog(token);

  const agentPickerList = useMemo(
    () => agentCatalog.map((a) => ({ id: a.id, name: a.name })),
    [agentCatalog],
  );

  hasStartedRef.current = hasStarted;

  const [historyAnimUnlocked, setHistoryAnimUnlocked] = useState(false);
  useEffect(() => {
    setHistoryAnimUnlocked(false);
  }, [conversationId]);
  useEffect(() => {
    if (messagesLoading) return;
    const raf = requestAnimationFrame(() => setHistoryAnimUnlocked(true));
    return () => cancelAnimationFrame(raf);
  }, [messagesLoading, conversationId]);

  const skipHistoryEnter = messagesLoading || !historyAnimUnlocked;

  // 找到最后一个未回答的 widget，用于渲染在底部覆盖输入框
  const activeWidget = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (m): m is WidgetMessage =>
            m.type === "widget" && !m.answer && !m.dismissed,
        ) ?? null,
    [messages],
  );

  const followUpLayoutKey = useMemo(
    () =>
      `${followUpSuggestions?.messageId ?? ""}:${
        followUpSuggestions?.items?.length ?? 0
      }`,
    [followUpSuggestions?.messageId, followUpSuggestions?.items?.length],
  );

  const inputBarModelCaps = useMemo(() => {
    const noListOrUnknownModel = {
      attachmentDisabled: true,
      deepThinkDisabledByModel: false,
      webSearchDisabledByModel: false,
    };
    if (!chatModelCatalog?.providers?.length) return noListOrUnknownModel;
    const pid =
      selectedProviderId.trim() || chatModelCatalog.default_llm_provider;
    const prov = chatModelCatalog.providers.find((x) => x.id === pid);
    if (!prov?.configured) return noListOrUnknownModel;
    const effectiveModelId =
      selectedChatModelId.trim() ||
      prov.models.find((o) => o.default)?.id ||
      prov.models[0]?.id ||
      "";
    const row = prov.models.find((x) => x.id === effectiveModelId);
    if (!row) return noListOrUnknownModel;
    const input = row.capabilities?.input;
    const hasImage = Array.isArray(input) && input.includes("image");
    const tools = row.capabilities?.supports_tool_calling !== false;
    const deep = row.capabilities?.supports_deep_think !== false;
    return {
      attachmentDisabled: !hasImage,
      deepThinkDisabledByModel: !deep,
      webSearchDisabledByModel: !tools,
    };
  }, [
    chatModelCatalog,
    selectedProviderId,
    selectedChatModelId,
  ]);

  const attachmentDisabledReason = useMemo(() => {
    if (!chatModelCatalog?.providers?.length) {
      return "未获取到模型目录（请检查接口与网络后刷新）";
    }
    const pid =
      selectedProviderId.trim() || chatModelCatalog.default_llm_provider;
    const prov = chatModelCatalog.providers.find((x) => x.id === pid);
    if (!prov?.configured) {
      return "当前所选厂商未配置 API Key，请在服务端 .env 填写对应 Key";
    }
    if (inputBarModelCaps.attachmentDisabled) {
      return "当前模型不支持图片，请切换到带附图能力的多模态模型";
    }
    return undefined;
  }, [
    chatModelCatalog,
    selectedProviderId,
    inputBarModelCaps.attachmentDisabled,
  ]);

  const scopedConversations = useMemo(() => {
    if (!token) return [];
    return serverConversations.filter((c) => {
      if (sidebarFilter === "__ungrouped__") return !c.group_id;
      return c.group_id === sidebarFilter;
    });
  }, [token, serverConversations, sidebarFilter]);

  /**
   * 侧栏「聊天」区列出未分组会话。
   * 若当前打开的是分组内会话（深链/刷新），在未分组列表中插入该行作为锚点，避免「主区域有对话但侧栏空白」。
   */
  const displayedSidebarConversations = useMemo(() => {
    if (!token) return [];
    const ungrouped = serverConversations.filter((c) => !c.group_id);
    const pinIdsOrdered = pinnedIds.filter((pid) =>
      ungrouped.some((c) => c.id === pid)
    );
    const pinSet = new Set(pinIdsOrdered);
    const pinnedOrdered: ServerConversation[] = pinIdsOrdered
      .map((id) => ungrouped.find((c) => c.id === id))
      .filter((c): c is ServerConversation => c != null);
    const rest = ungrouped.filter((c) => !pinSet.has(c.id));
    const base = [...pinnedOrdered, ...rest];

    if (!conversationId) return base;
    const activeRow = serverConversations.find((c) => c.id === conversationId);
    if (!activeRow?.group_id) return base;
    if (base.some((c) => c.id === conversationId)) return base;

    return [activeRow, ...base];
  }, [token, serverConversations, pinnedIds, conversationId]);

  const conversationGroupTrail = useMemo(() => {
    if (!conversationId || !token) return null;
    const c = serverConversations.find((x) => x.id === conversationId);
    if (!c?.group_id) return null;
    const gn =
      conversationFolders.find((f) => f.id === c.group_id)?.name?.trim() || "分组";
    return { groupName: gn };
  }, [conversationId, token, serverConversations, conversationFolders]);

  const viewingGroupLanding = useMemo(() => {
    if (!token || sidebarFilter === "__ungrouped__") return false;
    if (!conversationId) return true;
    const conv = serverConversations.find((c) => c.id === conversationId);
    return conv?.group_id !== sidebarFilter;
  }, [token, sidebarFilter, conversationId, serverConversations]);

  const showWelcomeHero = chatSurfacePhase === "newChat" && !viewingGroupLanding;
  /** 仅无缓存的首载/刷新用骨架；切换已有缓存会话时不顶替消息区 */
  const showConversationSkeleton =
    !viewingGroupLanding &&
    Boolean(urlConversationId) &&
    conversationRouteSynced &&
    messages.length === 0 &&
    (chatSurfacePhase === "authPending" || chatSurfacePhase === "hydrating");
  const showMessageList =
    hasStarted &&
    conversationRouteSynced &&
    (chatSurfacePhase === "ready" || messages.length > 0 || genState !== "idle");
  const showMessagesRefreshingOverlay =
    messagesLoading && messages.length > 0 && conversationRouteSynced;

  const selectedGroupFolderName =
    conversationFolders.find((f) => f.id === sidebarFilter)?.name?.trim() || "分组";

  const activeConvInSidebarGroup =
    !!conversationId &&
    sidebarFilter !== "__ungrouped__" &&
    serverConversations.find((c) => c.id === conversationId)?.group_id === sidebarFilter;

  const showBackToGroupWorkspace = Boolean(token) && activeConvInSidebarGroup;

  /** 仅更新 URL；加载由 useChat pathname effect 触发（含消息缓存） */
  const selectConversationSyncSidebar = useCallback(
    (id: string) => {
      router.push(chatPathConversation(id));
    },
    [router]
  );

  /**
   * 再次点击同一分组文件夹：关掉当前会话，回到该分组管理页；
   * 切换到其它文件夹或「未分组」仍只更新筛选。
   */
  const handleSidebarFilterChange = useCallback(
    (f: SidebarFilter) => {
      if (f !== "__ungrouped__" && f === sidebarFilter && conversationId) {
        handleNewChat();
        return;
      }
      if (f === "__ungrouped__") {
        router.push(chatPathNew());
        setSidebarFilter("__ungrouped__");
        return;
      }
      router.push(chatPathFolder(f));
      setSidebarFilter(f);
    },
    [sidebarFilter, conversationId, handleNewChat, router]
  );

  /** 顶部「返回分组」：与再次点侧栏文件夹相同 */
  const handleBackToGroupWorkspace = useCallback(() => {
    handleNewChat();
  }, [handleNewChat]);

  /** URL 为首要真相源：同步 pathname ↔ 会话与侧栏分组 */
  useEffect(() => {
    if (authLoading) return;
    const parsed = parseChatPathname(pathname);
    if (parsed.kind === "invalid") {
      router.replace(chatPathNew());
      return;
    }
    if (parsed.kind === "folder") {
      if (!token) {
        router.replace(chatPathNew());
        return;
      }
      setSidebarFilter(parsed.groupId);
      if (conversationId) handleNewChat({ skipNavigation: true });
      return;
    }
    if (parsed.kind === "new") {
      setSidebarFilter("__ungrouped__");
      if (conversationId && !sseRouteAssignPending) {
        handleNewChat({ skipNavigation: true });
      }
      return;
    }
    /* conversation：加载与未登录 redirect 由 useChat 内 effect 处理 */
  }, [
    pathname,
    authLoading,
    token,
    conversationId,
    router,
    handleNewChat,
    sseRouteAssignPending,
  ]);

  /** 会话已与 URL 对齐后，按列表推导侧栏分组（不依赖本 effect 触发加载，避免列表刷新导致整段路由 effect 重跑） */
  useEffect(() => {
    if (authLoading || !token) return;
    const parsed = parseChatPathname(pathname);
    if (parsed.kind !== "conversation" || parsed.conversationId !== conversationId || !conversationId) {
      return;
    }
    const conv = serverConversations.find((c) => c.id === conversationId);
    if (conv?.group_id) setSidebarFilter(conv.group_id);
    else setSidebarFilter("__ungrouped__");
    if (conv) {
      const aid = conv.agent_id?.trim();
      setChatAgentId(aid || null);
    }
  }, [pathname, authLoading, token, conversationId, serverConversations, setChatAgentId]);

  const prefetchConversationRoute = useCallback(
    (id: string) => {
      try {
        router.prefetch(chatPathConversation(id));
      } catch {
        /* ignore */
      }
    },
    [router]
  );

  const handleClearSidebarSelection = useCallback(() => {
    setSidebarSelectedIds(new Set());
  }, []);

  const handleToggleSidebarBatchMode = useCallback(() => {
    setSidebarBatchMode((prev) => {
      if (prev) {
        setSidebarSelectedIds(new Set());
        return false;
      }
      return true;
    });
  }, []);

  const handleToggleSidebarSelect = useCallback((id: string) => {
    setSidebarSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const handleSelectAllDisplayed = useCallback(() => {
    setSidebarSelectedIds(new Set(displayedSidebarConversations.map((c) => c.id)));
  }, [displayedSidebarConversations]);

  const runBulkDelete = useCallback(async () => {
    const ids = Array.from(sidebarSelectedIds);
    if (ids.length === 0) {
      setBulkDeleteConfirmOpen(false);
      return;
    }
    await deleteConversationsBulk(ids);
    setBulkDeleteConfirmOpen(false);
    setSidebarSelectedIds(new Set());
    setSidebarBatchMode(false);
  }, [sidebarSelectedIds, deleteConversationsBulk]);

  const handleSaveSidebarRename = useCallback(async () => {
    const m = renameConvModal;
    if (!m || !token || !m.draft.trim()) {
      setRenameConvModal(null);
      return;
    }
    try {
      await fetch(`${API_BASE}/api/chat/conversations/${m.id}/title`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: m.draft.trim() }),
      });
      await refreshServerConversations();
    } catch (e) {
      console.error(e);
    }
    setRenameConvModal(null);
  }, [renameConvModal, token, refreshServerConversations]);

  const submitNewGroup = useCallback(async () => {
    if (!newGroupNameDraft.trim()) {
      setNewGroupModalOpen(false);
      return;
    }
    const row = await createFolder(newGroupNameDraft);
    setNewGroupModalOpen(false);
    setNewGroupNameDraft("");
    if (row) {
      setSidebarFilter(row.id);
      router.push(chatPathFolder(row.id));
    }
  }, [newGroupNameDraft, createFolder, router]);

  const submitRenameFolder = useCallback(async () => {
    const m = renameFolderModal;
    if (!m?.draft.trim()) {
      setRenameFolderModal(null);
      return;
    }
    await renameFolder(m.id, m.draft);
    setRenameFolderModal(null);
  }, [renameFolderModal, renameFolder]);

  const confirmDeleteFolder = useCallback(async () => {
    const t = deleteFolderConfirm;
    if (!t) return;
    await deleteFolder(t.id);
    if (sidebarFilter === t.id) {
      setSidebarFilter("__ungrouped__");
      router.push(chatPathNew());
    }
    setDeleteFolderConfirm(null);
  }, [deleteFolderConfirm, deleteFolder, sidebarFilter, router]);

  const handleExportSidebarConversation = useCallback(
    async (id: string, title: string) => {
      if (!token) return;
      try {
        await downloadConversationMarkdown(token, id, title);
      } catch (e) {
        console.error(e);
      }
    },
    [token]
  );

  // 监听消息与追问占位变化，延迟一帧滚底以配合布局完成后高度，减弱「整块上闪」观感
  useEffect(() => {
    if (!hasStarted) return;
    if (!autoFollowMainRef.current) return;
    let rafHandle2 = 0;
    const raf1 = requestAnimationFrame(() => {
      rafHandle2 = requestAnimationFrame(() => {
        scrollToBottom(false);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(rafHandle2);
    };
  }, [
    messages,
    genState,
    hasStarted,
    scrollToBottom,
    autoFollowMainRef,
    followUpLayoutKey,
  ]);

  // 从 sessionStorage 恢复未发送的草稿（首屏回填一次）
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(PENDING_CHAT_DRAFT_KEY);
      if (draft != null && draft !== "") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 首屏回填草稿
        setInput(draft);
        sessionStorage.removeItem(PENDING_CHAT_DRAFT_KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // 切换会话时退出标题编辑
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 随 conversationId 同步编辑态
    setIsEditingTitle(false);
  }, [conversationId]);

  // 点击 Header 外部时关闭菜单
  useEffect(() => {
    if (!headerMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [headerMenuOpen]);

  const handleSend = useCallback(async () => {
    await chat.handleSend(input, setInput);
  }, [chat, input]);

  /** 附图快捷话术：直接使用文案发送，并附带当前 pending 图片（由 useChat.handleSend 清空列表） */
  const handleSendImageQuickPrompt = useCallback(
    async (prompt: string) => {
      await chat.handleSend(prompt, setInput);
    },
    [chat],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleExportHistory = () => {
    setHeaderMenuOpen(false);
    if (!messages.length) return;
    const title =
      serverConversations.find((c) => c.id === conversationId)?.title || "会话记录";
    const md = conversationToMarkdown(title, messages);
    const blob = new Blob([md], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeDownloadBasename(title)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveTitle = async () => {
    if (!conversationId || !token || !editTitleValue.trim()) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await fetch(`${API_BASE}/api/chat/conversations/${conversationId}/title`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editTitleValue.trim() }),
      });
      await refreshServerConversations();
    } catch (e) {
      console.error(e);
    }
    setIsEditingTitle(false);
  };

  /** 侧栏在 md 以下隐藏，移动端用顶栏骨架表示「会话标题加载中」 */
  const showMobileTitleSkeleton =
    Boolean(token) &&
    !authLoading &&
    !viewingGroupLanding &&
    (chatSurfacePhase === "hydrating" ||
      (hasStarted &&
        genState !== "idle" &&
        (!conversationId ||
          !(serverConversations.find((c) => c.id === conversationId)?.title ?? "").trim())));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#fdfdfc]">
      <ChatWorkspaceModals
        deleteTargetId={deleteTargetId}
        deletePending={deletePending}
        onConfirmDeleteConversation={() => void confirmDeleteConversation()}
        onCloseDeleteDialog={closeDeleteDialog}
        bulkDeleteConfirmOpen={bulkDeleteConfirmOpen}
        bulkDeletePending={bulkDeletePending}
        bulkSelectedCount={sidebarSelectedIds.size}
        onConfirmBulkDelete={() => void runBulkDelete()}
        onCancelBulkDelete={() => {
          if (bulkDeletePending) return;
          setBulkDeleteConfirmOpen(false);
        }}
        deleteFolderConfirm={deleteFolderConfirm}
        onConfirmDeleteFolder={() => void confirmDeleteFolder()}
        onCancelDeleteFolder={() => setDeleteFolderConfirm(null)}
        renameConvModal={renameConvModal}
        onRenameConvDraftChange={(draft) =>
          setRenameConvModal((m) => (m ? { ...m, draft } : m))
        }
        onCloseRenameConv={() => setRenameConvModal(null)}
        onSaveRenameConv={() => void handleSaveSidebarRename()}
        newGroupModalOpen={newGroupModalOpen}
        newGroupNameDraft={newGroupNameDraft}
        onNewGroupNameChange={setNewGroupNameDraft}
        onCloseNewGroup={() => setNewGroupModalOpen(false)}
        onSubmitNewGroup={() => void submitNewGroup()}
        renameFolderModal={renameFolderModal}
        onRenameFolderDraftChange={(draft) =>
          setRenameFolderModal((m) => (m ? { ...m, draft } : m))
        }
        onCloseRenameFolder={() => setRenameFolderModal(null)}
        onSaveRenameFolder={() => void submitRenameFolder()}
      />

      <Sidebar
        folders={conversationFolders}
        conversationsFull={token ? serverConversations : []}
        displayedConversations={displayedSidebarConversations}
        activeId={conversationId}
        sidebarFilter={sidebarFilter}
        onSidebarFilterChange={handleSidebarFilterChange}
        onNewChat={handleNewChat}
        onSelect={selectConversationSyncSidebar}
        onDelete={openDeleteDialog}
        onRenameRequest={(id, currentTitle) =>
          setRenameConvModal({ id, draft: currentTitle || "" })
        }
        onExportConversation={handleExportSidebarConversation}
        onTogglePin={togglePinConversation}
        onMoveToGroup={moveConversationToGroup}
        onCreateFolder={() => {
          setNewGroupNameDraft("");
          setNewGroupModalOpen(true);
        }}
        onRenameFolder={(groupId, currentName) =>
          setRenameFolderModal({ id: groupId, draft: currentName })
        }
        onDeleteFolder={(groupId) => {
          const name = conversationFolders.find((f) => f.id === groupId)?.name ?? "分组";
          setDeleteFolderConfirm({ id: groupId, name });
        }}
        pinnedIds={pinnedIds}
        batchMode={sidebarBatchMode}
        onToggleBatchMode={handleToggleSidebarBatchMode}
        selectedIds={sidebarSelectedIds}
        onToggleSelect={handleToggleSidebarSelect}
        onSelectAllDisplayed={handleSelectAllDisplayed}
        onClearBatchSelection={handleClearSidebarSelection}
        onBulkDelete={() => setBulkDeleteConfirmOpen(true)}
        bulkDeletePending={bulkDeletePending}
        streamBusy={genState !== "idle"}
        isGeneratingTitle={isGeneratingTitle}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onOpenSearch={() => setSearchOpen(true)}
        movePendingId={movePendingId}
        onPrefetchConversation={prefetchConversationRoute}
        conversationsLoading={listLoading}
      />

      <ConversationSearchModal
        open={searchOpen}
        conversations={token ? serverConversations : []}
        onClose={() => setSearchOpen(false)}
        onSelect={(id) => {
          void selectConversationSyncSidebar(id);
          setSearchOpen(false);
        }}
        onNewChat={() => {
          handleNewChat();
          setSearchOpen(false);
        }}
      />

      <main className="flex-1 flex flex-col relative min-w-0">
        <ChatHeader
          token={token}
          authLoading={authLoading}
          chatSurfacePhase={chatSurfacePhase}
          groupWorkspaceTitle={viewingGroupLanding ? selectedGroupFolderName : null}
          hasStarted={hasStarted}
          conversationId={conversationId}
          serverConversations={serverConversations}
          sidebarCollapsed={sidebarCollapsed}
          isGeneratingTitle={isGeneratingTitle}
          isEditingTitle={isEditingTitle}
          editTitleValue={editTitleValue}
          headerMenuOpen={headerMenuOpen}
          headerMenuRef={headerMenuRef}
          showMobileTitleSkeleton={showMobileTitleSkeleton}
          showBackToGroupWorkspace={Boolean(
            showBackToGroupWorkspace && !conversationGroupTrail
          )}
          onBackToGroupWorkspace={handleBackToGroupWorkspace}
          conversationGroupTrail={
            conversationGroupTrail
              ? { ...conversationGroupTrail, onGroupClick: handleBackToGroupWorkspace }
              : null
          }
          onToggleSidebar={() => setSidebarCollapsed(false)}
          onNewChat={handleNewChat}
          onSetHeaderMenuOpen={setHeaderMenuOpen}
          onEditTitle={() => {
            setIsEditingTitle(true);
            setEditTitleValue(
              serverConversations.find((c) => c.id === conversationId)?.title || ""
            );
            setHeaderMenuOpen(false);
          }}
          onExportHistory={handleExportHistory}
          onDeleteConversation={() => {
            setHeaderMenuOpen(false);
            if (conversationId) openDeleteDialog(conversationId);
          }}
          onEditTitleChange={setEditTitleValue}
          onEditTitleBlur={handleSaveTitle}
          onEditTitleKeyDown={(e) => {
            if (e.key === "Enter") void handleSaveTitle();
            else if (e.key === "Escape") setIsEditingTitle(false);
          }}
          onLogout={logout}
        />

        <div className="flex flex-1 flex-col relative min-h-0 overflow-hidden">
          {!viewingGroupLanding ? (
            <>
              <div
                ref={scrollViewportRef}
                onScroll={updateScrollState}
                className={`chat-scroll-area no-scrollbar flex-1 overflow-y-auto ${
                  !viewingGroupLanding
                    ? [
                        showWelcomeHero ? "flex min-h-0 flex-col" : "",
                        "pb-[clamp(7rem,11vh,9.5rem)] md:pb-[clamp(7.25rem,11.25vh,9.75rem)]",
                      ].join(" ")
                    : ""
                }`}
              >
                {showWelcomeHero && <WelcomeHero />}
                {showConversationSkeleton && <ConversationSkeleton />}
                {showMessageList ? (
                  <ChatMessageList
                    messages={messages}
                    setMessages={setMessages}
                    skipHistoryEnter={skipHistoryEnter}
                    showMessagesRefreshingOverlay={showMessagesRefreshingOverlay}
                    genState={genState}
                    lastAssistantMessageId={lastAssistantMessageId}
                    followUpSuggestions={followUpSuggestions}
                    onFollowUpClick={(text) => {
                      setInput(text);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    onAssistantRegenerate={handleRegenerateAssistant}
                    onUserEdit={(text, imageUrls) => {
                      applyComposerAttachmentsFromUserMessage(imageUrls);
                      setInput(text);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    onWidgetAnswer={handleWidgetAnswer}
                    messagesEndRef={messagesEndRef}
                  />
                ) : null}
                </div>

              <AnimatePresence>
                {showScrollToBottom && hasStarted && !viewingGroupLanding && (
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 10, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.92 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                onClick={() => {
                  autoFollowMainRef.current = true;
                  scrollToBottom(true);
                }}
                className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#e5e5e5] bg-white/92 px-3.5 py-2 text-sm text-gray-700 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur bottom-40 md:bottom-44 hover:bg-gray-50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
              >
                <ArrowDown className="h-4 w-4" />
                <span>回到底部</span>
              </motion.button>
            )}
          </AnimatePresence>
            </>
          ) : (
            <GroupWorkspace
              groupName={selectedGroupFolderName}
              conversationsInGroup={scopedConversations}
              onOpenConversation={(id) => void selectConversationSyncSidebar(id)}
            />
          )}

          {/* 未回答的 widget 作为底部覆盖层，盖住 ChatInputBar */}
          <AnimatePresence>
            {activeWidget && (
              <motion.div
                key={activeWidget.id}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20, transition: { duration: 0.15 } }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center bg-gradient-to-t from-[#fdfdfc] from-50% via-[#fdfdfc]/90 to-transparent px-4 pb-5 pt-10 md:px-8"
              >
                <div className="w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl max-h-[min(75vh,36rem)] overflow-y-auto">
                  <WidgetCard
                    question={activeWidget.question}
                    choices={activeWidget.choices}
                    allowFreeText={activeWidget.allowFreeText}
                    answer={activeWidget.answer}
                    dismissed={activeWidget.dismissed}
                    disabled={genState !== "idle"}
                    onAnswer={(ans) => handleWidgetAnswer(activeWidget.id, ans)}
                  />
                </div>
                <p className="mt-2 text-center text-[11px] text-gray-400 select-none">
                  ↑↓ 导航&nbsp;&nbsp;·&nbsp;&nbsp;Enter 选择&nbsp;&nbsp;·&nbsp;&nbsp;Esc 跳过
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <ChatInputBar
            input={input}
            hasStarted={hasStarted || viewingGroupLanding}
            genState={genState}
            deepThinkEnabled={deepThinkEnabled}
            webSearchEnabled={webSearchEnabled}
            webSearchMode={webSearchMode}
            inputRef={inputRef}
            onInputChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={() => void handleSend()}
            onStop={handleStop}
            onToggleDeepThink={() => setDeepThinkEnabled((v) => !v)}
            onToggleWebSearch={() => setWebSearchEnabled((v) => !v)}
            onSetWebSearchMode={(mode) => {
              setWebSearchEnabled(true);
              setWebSearchMode(mode);
            }}
            modelCatalog={chatModelCatalog}
            selectedProviderId={selectedProviderId}
            selectedModelId={selectedChatModelId}
            onSelectModel={(providerId, modelId) => setModelPick(providerId, modelId)}
            attachmentDisabled={inputBarModelCaps.attachmentDisabled}
            attachmentDisabledReason={attachmentDisabledReason}
            deepThinkDisabledByModel={inputBarModelCaps.deepThinkDisabledByModel}
            webSearchDisabledByModel={inputBarModelCaps.webSearchDisabledByModel}
            pendingImageUrls={pendingImageUrls}
            onRemovePendingImage={removePendingImageUrlAt}
            onImageFilesSelected={(files) => void pushImageAttachments(files)}
            attachmentUploadBusy={attachmentUploadBusy}
            attachmentUploadSkeletonCount={attachmentUploadSkeletonCount}
            attachmentUploadSlotProgress={attachmentUploadSlotProgress}
            onSendWithImagePrompt={handleSendImageQuickPrompt}
            fetchAiImageQuickPrompts={fetchAiImageQuickPrompts}
            placeholder={
              viewingGroupLanding ? "在这里提问，新建对话" : undefined
            }
            usageHint={inputBarUsageHint}
            chatSurfacePhase={chatSurfacePhase}
            showAgentPicker={Boolean(token) && !authLoading}
            agents={agentPickerList}
            selectedAgentId={chatAgentId}
            onSelectAgent={setChatAgentId}
            agentsLoading={agentsLoading}
          />
        </div>
      </main>
    </div>
  );
}
