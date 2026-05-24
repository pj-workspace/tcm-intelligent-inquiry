/**
 * @fileoverview 共享 UI 动效 preset（Framer Motion），与 animations.css 缓动一致。
 */

export const UI_EASE_POP = [0.16, 1, 0.3, 1] as const;

/** 模态遮罩淡入淡出动画配置。 */
export const uiModalBackdrop = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.22, ease: UI_EASE_POP },
} as const;

/** 模态面板 spring 弹入动画配置。 */
export const uiModalPanel = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 12 },
  transition: {
    type: "spring" as const,
    stiffness: 460,
    damping: 34,
    mass: 0.82,
  },
} as const;

/** 主按钮下方展开的小菜单（顶栏 ⋮ 等）：从略高处落下，而非自下而上 */
export const uiDropdownBelow = {
  initial: { opacity: 0, scale: 0.98, y: -8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -4 },
  transition: { duration: 0.2, ease: UI_EASE_POP },
} as const;

/** 贴顶/贴边轻量 Popover */
export const uiMenuPopover = {
  initial: { opacity: 0, scale: 0.98, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -6 },
  transition: { duration: 0.2, ease: UI_EASE_POP },
} as const;

/** 自左侧滑入的抽屉面板（移动端侧栏等）。 */
export const uiDrawerSlide = {
  initial: { x: "-100%" },
  animate: { x: 0 },
  exit: { x: "-100%" },
  transition: { duration: 0.28, ease: UI_EASE_POP },
} as const;
