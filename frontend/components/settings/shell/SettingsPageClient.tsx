/**
 * @fileoverview 设置页 Client 壳：Tab 导航与各功能 Tab 懒渲染。
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeft, Box, Plug, Bot, Database, PieChart, User } from "lucide-react";
import { BuiltinToolsTab } from "@/components/settings/builtin/BuiltinToolsTab";
import { McpTab } from "@/components/settings/mcp/McpTab";
import { AgentsTab } from "@/components/settings/agents/AgentsTab";
import { KnowledgeTab } from "@/components/settings/knowledge/KnowledgeTab";
import { AccountTab } from "@/components/settings/account/AccountTab";
import { BillingTab } from "@/components/settings/billing/BillingTab";

type TabId = "builtin" | "mcp" | "knowledge" | "agents" | "billing" | "account";

/** 工具与 Agent 设置页（需登录）。 */
export function SettingsPageClient() {
  const { loading, token } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("builtin");

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    }
  }, [loading, token, router]);

  if (loading || !token) {
    return (
      <div className="fixed inset-0 z-10 flex min-h-0 items-center justify-center overflow-hidden bg-[#fdfdfc]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
      </div>
    );
  }

  /* fixed inset-0：脱离文档流，避免 body(min-h-full flex) 与 main(overflow-y-auto) 双滚动；底部不再露出 body 背景 */
  return (
    <div className="fixed inset-0 z-10 flex min-h-0 w-full flex-col overflow-hidden bg-[#fdfdfc] text-gray-800">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white/80 px-4 backdrop-blur-sm md:px-6">
        <Link
          href="/chat"
          className="mr-4 flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          返回对话
        </Link>
        <h1 className="text-base font-semibold">工具与 Agent 设置</h1>
      </header>

      {/* Layout：横向 flex 子项补全 w-full/min-w-0，避免首轮布局时 main 可用宽度未稳定、resize 后才正常 */}
      <div className="flex min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {/* Sidebar Nav */}
        <nav className="w-56 shrink-0 border-r border-[#e5e5e5] bg-[#fbfaf7] p-4">
          <div className="space-y-1">
            <button
              onClick={() => setActiveTab("builtin")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.99] ${
                activeTab === "builtin"
                  ? "bg-white text-orange-600 shadow-sm ring-1 ring-gray-200 hover:bg-orange-50/40"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Box className="h-4 w-4" />
              内置工具
            </button>
            <button
              onClick={() => setActiveTab("mcp")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.99] ${
                activeTab === "mcp"
                  ? "bg-white text-orange-600 shadow-sm ring-1 ring-gray-200 hover:bg-orange-50/40"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Plug className="h-4 w-4" />
              MCP 服务
            </button>
            <button
              onClick={() => setActiveTab("knowledge")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.99] ${
                activeTab === "knowledge"
                  ? "bg-white text-orange-600 shadow-sm ring-1 ring-gray-200 hover:bg-orange-50/40"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Database className="h-4 w-4" />
              知识库
            </button>
            <button
              onClick={() => setActiveTab("agents")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.99] ${
                activeTab === "agents"
                  ? "bg-white text-orange-600 shadow-sm ring-1 ring-gray-200 hover:bg-orange-50/40"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Bot className="h-4 w-4" />
              Agent 管理
            </button>
            <button
              onClick={() => setActiveTab("billing")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.99] ${
                activeTab === "billing"
                  ? "bg-white text-orange-600 shadow-sm ring-1 ring-gray-200 hover:bg-orange-50/40"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <PieChart className="h-4 w-4" />
              计费与用量
            </button>
            <button
              onClick={() => setActiveTab("account")}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:scale-[0.99] ${
                activeTab === "account"
                  ? "bg-white text-orange-600 shadow-sm ring-1 ring-gray-200 hover:bg-orange-50/40"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <User className="h-4 w-4" />
              账号与安全
            </button>
          </div>
        </nav>

        {/* Main Content Area：min-w-0 避免被子内容 intrinsic 最小宽度撑开整页（flex 默认 min-width:auto） */}
        <main className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-y-auto overflow-x-hidden bg-[#fdfdfc] p-6 md:p-8">
          <div className="mx-auto box-border w-full min-w-0 max-w-4xl shrink-0">
            {activeTab === "builtin" && <BuiltinToolsTab />}
            {activeTab === "mcp" && <McpTab />}
            {activeTab === "knowledge" && <KnowledgeTab />}
            {activeTab === "agents" && <AgentsTab />}
            {activeTab === "billing" && <BillingTab />}
            {activeTab === "account" && <AccountTab />}
          </div>
        </main>
      </div>
    </div>
  );
}
