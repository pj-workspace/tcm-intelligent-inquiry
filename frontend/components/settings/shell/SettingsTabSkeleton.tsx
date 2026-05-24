/**
 * @fileoverview 设置 Tab 懒加载占位骨架。
 */

/** Tab 内容区加载中占位。 */
export function SettingsTabSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy aria-label="加载中">
      <div className="space-y-2">
        <div className="h-6 w-40 rounded-md bg-gray-200/80" />
        <div className="h-4 w-full max-w-md rounded-md bg-gray-100" />
      </div>
      <div className="space-y-3">
        <div className="h-28 rounded-xl bg-gray-100" />
        <div className="h-28 rounded-xl bg-gray-100" />
      </div>
    </div>
  );
}
