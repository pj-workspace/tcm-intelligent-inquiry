/**
 * @fileoverview 设置页 Client 壳：Tab 导航与各功能 Tab 懒渲染。
 */
"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeft } from "lucide-react";
import clsx from "clsx";
import {
  SETTINGS_TABS,
  parseSettingsTabId,
  settingsTabLabel,
  type SettingsTabId,
} from "./settingsTabs";
import { SettingsTabSkeleton } from "./SettingsTabSkeleton";

const AppearanceTab = dynamic(
  () =>
    import("@/components/settings/appearance/AppearanceTab").then((m) => ({
      default: m.AppearanceTab,
    })),
  { loading: () => <SettingsTabSkeleton /> },
);
const BuiltinToolsTab = dynamic(
  () =>
    import("@/components/settings/builtin/BuiltinToolsTab").then((m) => ({
      default: m.BuiltinToolsTab,
    })),
  { loading: () => <SettingsTabSkeleton /> },
);
const McpTab = dynamic(
  () =>
    import("@/components/settings/mcp/McpTab").then((m) => ({
      default: m.McpTab,
    })),
  { loading: () => <SettingsTabSkeleton /> },
);
const KnowledgeTab = dynamic(
  () =>
    import("@/components/settings/knowledge/KnowledgeTab").then((m) => ({
      default: m.KnowledgeTab,
    })),
  { loading: () => <SettingsTabSkeleton /> },
);
const AgentsTab = dynamic(
  () =>
    import("@/components/settings/agents/AgentsTab").then((m) => ({
      default: m.AgentsTab,
    })),
  { loading: () => <SettingsTabSkeleton /> },
);
const BillingTab = dynamic(
  () =>
    import("@/components/settings/billing/BillingTab").then((m) => ({
      default: m.BillingTab,
    })),
  { loading: () => <SettingsTabSkeleton /> },
);
const AccountTab = dynamic(
  () =>
    import("@/components/settings/account/AccountTab").then((m) => ({
      default: m.AccountTab,
    })),
  { loading: () => <SettingsTabSkeleton /> },
);

const TAB_PANELS: Record<SettingsTabId, ComponentType> = {
  appearance: AppearanceTab,
  builtin: BuiltinToolsTab,
  mcp: McpTab,
  knowledge: KnowledgeTab,
  agents: AgentsTab,
  billing: BillingTab,
  account: AccountTab,
};

function tabButtonClass(active: boolean) {
  return clsx(
    "transition-colors active:scale-[0.99]",
    active
      ? "bg-white text-orange-600 shadow-sm ring-1 ring-gray-200 hover:bg-orange-50/40"
      : "text-gray-600 hover:bg-gray-100",
  );
}

type SettingsPageClientProps = {
  initialTab?: SettingsTabId;
};

type SettingsTabPanelProps = {
  id: SettingsTabId;
  activeTab: SettingsTabId;
  mounted: boolean;
};

/** 已访问 Tab 保持挂载，切换时仅 hidden。 */
function SettingsTabPanel({ id, activeTab, mounted }: SettingsTabPanelProps) {
  if (!mounted) return null;
  const Panel = TAB_PANELS[id];
  const isActive = activeTab === id;
  return (
    <div
      role="tabpanel"
      id={`settings-panel-${id}`}
      aria-label={settingsTabLabel(id)}
      hidden={!isActive}
      tabIndex={isActive ? 0 : -1}
    >
      <Panel />
    </div>
  );
}

/** 工具与 Agent 设置页（需登录）。 */
export function SettingsPageClient({ initialTab = "builtin" }: SettingsPageClientProps) {
  const { loading, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mainRef = useRef<HTMLElement>(null);
  const mobileTabRefs = useRef<Map<SettingsTabId, HTMLButtonElement>>(new Map());
  const isFirstTabEffect = useRef(true);

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl ? parseSettingsTabId(tabFromUrl, initialTab) : initialTab;

  const [mountedTabs, setMountedTabs] = useState<Set<SettingsTabId>>(
    () => new Set([activeTab]),
  );

  const selectTab = useCallback(
    (id: SettingsTabId) => {
      if (id === activeTab) return;
      router.replace(`/settings?tab=${id}`, { scroll: false });
    },
    [activeTab, router],
  );

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });

    if (isFirstTabEffect.current) {
      isFirstTabEffect.current = false;
      return;
    }

    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
    mobileTabRefs.current
      .get(activeTab)
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeTab]);

  useEffect(() => {
    const raw = searchParams.get("tab");
    if (!raw) return;
    const parsed = parseSettingsTabId(raw);
    if (parsed !== raw.trim()) {
      router.replace(`/settings?tab=${parsed}`, { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    }
  }, [loading, token, router]);

  const activeLabel = settingsTabLabel(activeTab);

  if (loading || !token) {
    return (
      <div className="fixed inset-0 z-10 flex h-dvh max-h-dvh min-h-0 items-center justify-center overflow-hidden bg-[#fdfdfc]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-10 flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-[#fdfdfc] text-gray-800">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#e5e5e5] bg-white/80 px-4 backdrop-blur-sm md:px-6">
        <Link
          href="/chat"
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
          aria-label="返回对话"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">返回对话</span>
        </Link>
        <h1 className="min-w-0 truncate text-base font-semibold sm:hidden">
          设置
          <span className="font-normal text-gray-400"> · </span>
          {activeLabel}
        </h1>
        <h1 className="hidden min-w-0 truncate text-base font-semibold sm:block">
          工具与 Agent 设置
        </h1>
      </header>

      <nav
        className="no-scrollbar flex shrink-0 gap-1 overflow-x-auto border-b border-[#e5e5e5] bg-[#fbfaf7] px-4 py-2 md:hidden"
        role="tablist"
        aria-label="设置分类"
      >
        {SETTINGS_TABS.map(({ id, shortLabel, Icon }) => (
          <button
            key={id}
            ref={(el) => {
              if (el) mobileTabRefs.current.set(id, el);
              else mobileTabRefs.current.delete(id);
            }}
            type="button"
            role="tab"
            id={`settings-tab-mobile-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`settings-panel-${id}`}
            onClick={() => selectTab(id)}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium",
              tabButtonClass(activeTab === id),
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {shortLabel}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <nav
          className="hidden w-56 shrink-0 border-r border-[#e5e5e5] bg-[#fbfaf7] p-4 md:block"
          role="tablist"
          aria-label="设置分类"
          aria-orientation="vertical"
        >
          <div className="space-y-1">
            {SETTINGS_TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`settings-tab-desktop-${id}`}
                aria-selected={activeTab === id}
                aria-controls={`settings-panel-${id}`}
                onClick={() => selectTab(id)}
                className={clsx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium",
                  tabButtonClass(activeTab === id),
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </nav>

        <main
          ref={mainRef}
          className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[#fdfdfc] p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-6 md:p-8 md:pb-[calc(2rem+env(safe-area-inset-bottom,0px))]"
        >
          <div className="mx-auto box-border w-full min-w-0 max-w-4xl shrink-0">
            {SETTINGS_TABS.map(({ id }) => (
              <SettingsTabPanel
                key={id}
                id={id}
                activeTab={activeTab}
                mounted={mountedTabs.has(id)}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
