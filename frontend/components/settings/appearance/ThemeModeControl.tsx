/**
 * @fileoverview 颜色模式三段式控件，绑定 next-themes。
 */
"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { SegmentedControl, type SegmentedOption } from "./appearanceShared";

type ThemeMode = "system" | "light" | "dark";

const THEME_OPTIONS: SegmentedOption<ThemeMode>[] = [
  {
    value: "system",
    label: "跟随系统",
    ariaLabel: "跟随系统",
    icon: <Monitor className="h-4 w-4" aria-hidden />,
  },
  {
    value: "light",
    label: "浅色",
    ariaLabel: "浅色",
    icon: <Sun className="h-4 w-4" aria-hidden />,
  },
  {
    value: "dark",
    label: "深色",
    ariaLabel: "深色",
    icon: <Moon className="h-4 w-4" aria-hidden />,
  },
];

/** 全局颜色模式切换（system / light / dark）。 */
export function ThemeModeControl() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div
        className="inline-flex h-[42px] w-[min(100%,14rem)] animate-pulse rounded-xl border border-border bg-muted"
        aria-hidden
      />
    );
  }

  const value = (theme ?? "system") as ThemeMode;

  return (
    <SegmentedControl<ThemeMode>
      value={value}
      onChange={(next) => setTheme(next)}
      options={THEME_OPTIONS}
    />
  );
}
