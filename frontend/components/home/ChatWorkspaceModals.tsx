/**
 * @fileoverview 对话工作台各类确认/重命名弹窗的集中挂载点（与 HomePageClient 状态解耦展示）。
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";

type Props = {
  deleteTargetId: string | null;
  deletePending: boolean;
  onConfirmDeleteConversation: () => void;
  onCloseDeleteDialog: () => void;
  bulkDeleteConfirmOpen: boolean;
  bulkDeletePending: boolean;
  bulkSelectedCount: number;
  onConfirmBulkDelete: () => void;
  onCancelBulkDelete: () => void;
  deleteFolderConfirm: { id: string; name: string } | null;
  onConfirmDeleteFolder: () => void;
  onCancelDeleteFolder: () => void;
  renameConvModal: { id: string; draft: string } | null;
  onRenameConvDraftChange: (draft: string) => void;
  onCloseRenameConv: () => void;
  onSaveRenameConv: () => void;
  newGroupModalOpen: boolean;
  newGroupNameDraft: string;
  onNewGroupNameChange: (v: string) => void;
  onCloseNewGroup: () => void;
  onSubmitNewGroup: () => void;
  renameFolderModal: { id: string; draft: string } | null;
  onRenameFolderDraftChange: (draft: string) => void;
  onCloseRenameFolder: () => void;
  onSaveRenameFolder: () => void;
};

/** 删除、批量删除、分组与重命名等模态框集合。 */
export function ChatWorkspaceModals({
  deleteTargetId,
  deletePending,
  onConfirmDeleteConversation,
  onCloseDeleteDialog,
  bulkDeleteConfirmOpen,
  bulkDeletePending,
  bulkSelectedCount,
  onConfirmBulkDelete,
  onCancelBulkDelete,
  deleteFolderConfirm,
  onConfirmDeleteFolder,
  onCancelDeleteFolder,
  renameConvModal,
  onRenameConvDraftChange,
  onCloseRenameConv,
  onSaveRenameConv,
  newGroupModalOpen,
  newGroupNameDraft,
  onNewGroupNameChange,
  onCloseNewGroup,
  onSubmitNewGroup,
  renameFolderModal,
  onRenameFolderDraftChange,
  onCloseRenameFolder,
  onSaveRenameFolder,
}: Props) {
  return (
    <>
      <ConfirmDialog
        open={deleteTargetId !== null}
        title="删除会话"
        description="确定删除该会话？删除后无法恢复。"
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        pending={deletePending}
        onConfirm={onConfirmDeleteConversation}
        onCancel={onCloseDeleteDialog}
      />

      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="批量删除"
        description={`确定删除已选中的 ${bulkSelectedCount} 条会话？删除后无法恢复。`}
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        pending={bulkDeletePending}
        onConfirm={onConfirmBulkDelete}
        onCancel={onCancelBulkDelete}
      />

      <ConfirmDialog
        open={deleteFolderConfirm !== null}
        title="删除分组"
        description={
          deleteFolderConfirm
            ? `确定删除分组「${deleteFolderConfirm.name}」？会话将移回未分组。`
            : ""
        }
        confirmLabel="删除"
        cancelLabel="取消"
        danger
        pending={false}
        onConfirm={onConfirmDeleteFolder}
        onCancel={onCancelDeleteFolder}
      />

      <AnimatePresence>
        {renameConvModal && (
          <motion.div
            key="rename-conv"
            className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && onCloseRenameConv()}
            {...uiModalBackdrop}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
              {...uiModalPanel}
            >
              <h2 className="text-lg font-semibold text-foreground">编辑会话名称</h2>
              <input
                autoFocus
                className="mt-4 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
                value={renameConvModal.draft}
                onChange={(e) => onRenameConvDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveRenameConv();
                  if (e.key === "Escape") onCloseRenameConv();
                }}
              />
              <motion.div className="mt-6 flex justify-end gap-2" layout={false}>
                <button
                  type="button"
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={onCloseRenameConv}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  onClick={onSaveRenameConv}
                >
                  保存
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {newGroupModalOpen && (
          <motion.div
            key="new-group"
            className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && onCloseNewGroup()}
            {...uiModalBackdrop}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
              {...uiModalPanel}
            >
              <h2 className="text-lg font-semibold text-foreground">新建分组</h2>
              <input
                autoFocus
                className="mt-4 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
                placeholder="分组名称"
                value={newGroupNameDraft}
                onChange={(e) => onNewGroupNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSubmitNewGroup();
                  if (e.key === "Escape") onCloseNewGroup();
                }}
              />
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={onCloseNewGroup}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  onClick={onSubmitNewGroup}
                >
                  创建
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {renameFolderModal && (
          <motion.div
            key={`rename-folder-${renameFolderModal.id}`}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
            onClick={(e) => e.target === e.currentTarget && onCloseRenameFolder()}
            {...uiModalBackdrop}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg"
              onClick={(e) => e.stopPropagation()}
              {...uiModalPanel}
            >
              <h2 className="text-lg font-semibold text-foreground">重命名分组</h2>
              <input
                autoFocus
                className="mt-4 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"
                value={renameFolderModal.draft}
                onChange={(e) => onRenameFolderDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveRenameFolder();
                  if (e.key === "Escape") onCloseRenameFolder();
                }}
              />
              <motion.div className="mt-6 flex justify-end gap-2" layout={false}>
                <button
                  type="button"
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                  onClick={onCloseRenameFolder}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  onClick={onSaveRenameFolder}
                >
                  保存
                </button>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
