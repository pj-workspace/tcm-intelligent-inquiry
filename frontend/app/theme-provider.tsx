/**
 * @fileoverview next-themes 包装：class 策略 + localStorage 持久化。
 */
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/** 全局主题 Provider（system / light / dark）。 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="tcm-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
