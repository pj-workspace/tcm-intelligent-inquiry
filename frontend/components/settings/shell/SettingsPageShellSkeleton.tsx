/**
 * @fileoverview 设置页加载占位：壳层 + Tab 内容骨架。
 */

import { SettingsTabSkeleton } from "./SettingsTabSkeleton";

/** 设置页整页加载占位（auth 校验或 Suspense 时使用）。 */
export function SettingsPageShellSkeleton() {
  return (
    <div className="fixed inset-0 z-10 flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-elevated/80 px-4 backdrop-blur-sm md:px-6">
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
        <div className="hidden h-5 w-32 animate-pulse rounded-md bg-muted sm:block" />
      </header>

      <nav
        className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-surface-muted px-4 py-2 md:hidden"
        aria-hidden
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-16 shrink-0 animate-pulse rounded-lg bg-muted" />
        ))}
      </nav>

      <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <nav
          className="hidden w-56 shrink-0 border-r border-border bg-surface-muted p-4 md:block"
          aria-hidden
        >
          <div className="space-y-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        </nav>

        <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="mx-auto w-full min-w-0 max-w-4xl">
            <SettingsTabSkeleton />
          </div>
        </main>
      </div>
    </div>
  );
}
