/**
 * @fileoverview 聊天工作台 UI 门控阶段，与 `useChat` 的 `chatSurfacePhase` 对齐。
 */

/** UI 门控：欢迎页/骨架/消息区；滚动与发送仍用 hasStarted。 */
export type ChatSurfacePhase = "authPending" | "newChat" | "hydrating" | "ready";
