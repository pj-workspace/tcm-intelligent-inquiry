/**
 * @fileoverview 界面与偏好 Tab（Mock：控件可点选，暂不写入存储或全局状态）。
 */
"use client";

import { useState } from "react";
import {
  Bell,
  Globe,
  Monitor,
  Moon,
  Palette,
  Sun,
  Type,
} from "lucide-react";
import { SectionShell } from "@/components/settings/account/accountShared";
import { Select } from "@/components/ui/Select";
import {
  MockSegmentedControl,
  MockToggle,
  PreferenceRow,
} from "./appearanceShared";

type ThemeMode = "system" | "light" | "dark";
type Locale = "zh-CN" | "en-US";
type ChatFont = "sans" | "serif";
type MessageDensity = "comfortable" | "compact";

const LOCALE_OPTIONS = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
];

const FONT_OPTIONS = [
  { value: "sans", label: "无衬线（Inter）" },
  { value: "serif", label: "衬线（Noto Serif SC）" },
];

const DENSITY_OPTIONS = [
  { value: "comfortable", label: "标准" },
  { value: "compact", label: "紧凑" },
];

/** 界面与偏好设置 Mock Tab。 */
export function AppearanceTab() {
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [chatFont, setChatFont] = useState<ChatFont>("sans");
  const [density, setDensity] = useState<MessageDensity>("comfortable");
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [soundOnComplete, setSoundOnComplete] = useState(false);

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight text-[#1c1917]">界面与偏好</h1>
        <p className="max-w-2xl text-[13px] leading-relaxed text-gray-600">
          调整主题、语言与聊天体验。当前为界面预览，选项可交互但尚未接入全局生效逻辑。
        </p>
      </header>

      <div className="rounded-xl border border-dashed border-orange-200/80 bg-orange-50/50 px-4 py-3 text-[13px] text-orange-950">
        <span className="font-medium">Mock 预览</span>
        <span className="text-orange-900/85">
          {" "}
          — 以下设置仅在本页本地演示，刷新后将恢复默认。后续将逐项接入持久化与全局应用。
        </span>
      </div>

      <SectionShell
        icon={Palette}
        title="外观"
        description="选择界面颜色模式，深色模式将在后续版本中全站生效。"
      >
        <PreferenceRow
          label="颜色模式"
          description="跟随系统、或固定为浅色 / 深色主题。"
        >
          <MockSegmentedControl<ThemeMode>
            value={theme}
            onChange={setTheme}
            options={[
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
            ]}
          />
        </PreferenceRow>
      </SectionShell>

      <SectionShell
        icon={Globe}
        title="语言"
        description="界面显示语言。完整多语言文案将在 i18n 接入后生效。"
      >
        <PreferenceRow label="界面语言" description="影响菜单、按钮与系统提示的显示语言。">
          <Select
            value={locale}
            onValueChange={(v) => setLocale(v as Locale)}
            options={LOCALE_OPTIONS}
            className="w-full sm:w-52"
          />
        </PreferenceRow>
      </SectionShell>

      <SectionShell
        icon={Type}
        title="聊天体验"
        description="调整对话区域的字体与排版密度。"
      >
        <div className="divide-y divide-[#f2f0ec]">
          <PreferenceRow label="正文字体" description="对话消息使用的字体风格。">
            <Select
              value={chatFont}
              onValueChange={(v) => setChatFont(v as ChatFont)}
              options={FONT_OPTIONS}
              className="w-full sm:w-52"
            />
          </PreferenceRow>

          <PreferenceRow label="消息密度" description="控制气泡间距与列表紧凑程度。">
            <Select
              value={density}
              onValueChange={(v) => setDensity(v as MessageDensity)}
              options={DENSITY_OPTIONS}
              className="w-full sm:w-52"
            />
          </PreferenceRow>
        </div>

        <div className="mt-6 rounded-xl border border-[#eae8e3] bg-[#fafaf9]/80 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            预览
          </p>
          <div
            className={clsxPreview(chatFont, density)}
          >
            <p className="text-sm text-[#1c1917]">
              这是助手回复的示例文字，用于预览当前字体与密度设置。
            </p>
            <p className="text-sm text-gray-600">
              中医问诊助手会根据您的描述继续追问相关症状。
            </p>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        icon={Bell}
        title="通知"
        description="长任务完成时的提醒方式。"
      >
        <div className="divide-y divide-[#f2f0ec]">
          <PreferenceRow
            label="回复完成通知"
            description="模型生成长回复结束后发送浏览器或站内提醒。"
          >
            <MockToggle
              id="notify-on-complete"
              checked={notifyOnComplete}
              onChange={setNotifyOnComplete}
            />
          </PreferenceRow>

          <PreferenceRow
            label="完成提示音"
            description="回复结束时播放短促提示音（需浏览器允许）。"
          >
            <MockToggle
              id="sound-on-complete"
              checked={soundOnComplete}
              onChange={setSoundOnComplete}
              disabled={!notifyOnComplete}
            />
          </PreferenceRow>
        </div>
      </SectionShell>
    </div>
  );
}

function clsxPreview(font: ChatFont, density: MessageDensity) {
  const fontClass = font === "serif" ? "font-serif" : "font-sans";
  const densityClass =
    density === "compact" ? "space-y-1 leading-snug" : "space-y-2 leading-relaxed";
  return `${fontClass} ${densityClass}`;
}
