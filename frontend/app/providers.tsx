/**
 * @fileoverview 客户端全局 Provider 聚合：主题、认证上下文与 Toast 通知。
 */
"use client";

import { AuthProvider } from "@/contexts/auth-context";
import { Toaster } from "sonner";
import { ThemeProvider } from "./theme-provider";

/** 包裹整棵 React 树的客户端 Provider（Theme + Auth + Sonner Toaster）。 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          className="font-sans"
          toastOptions={{ classNames: { title: "font-medium" } }}
        />
      </AuthProvider>
    </ThemeProvider>
  );
}
