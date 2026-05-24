/**
 * @fileoverview 输入栏 Agent 选择（独立 pill，置于底栏最左）。
 */
"use client";

import { useMemo } from "react";
import * as Select from "@radix-ui/react-select";
import { Bot, Check, ChevronDown } from "lucide-react";
import {
  SYSTEM_AGENT_LABEL,
  SYSTEM_AGENT_SELECT_VALUE,
} from "@/lib/chatAgentConstants";
import type { GenerationState } from "@/types/chat";

const triggerCls =
  "inline-flex max-w-[min(10rem,38vw)] shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none transition-colors hover:bg-gray-100 disabled:opacity-45 sm:max-w-[12rem] sm:px-3";

type ComposerAgentPickerProps = {
  genState: GenerationState;
  agents: { id: string; name: string }[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  agentsLoading?: boolean;
};

/** Agent pill 选择器。 */
export function ComposerAgentPicker({
  genState,
  agents,
  selectedAgentId,
  onSelectAgent,
  agentsLoading = false,
}: ComposerAgentPickerProps) {
  const agentSelectValue = useMemo(() => {
    const id = selectedAgentId?.trim();
    if (!id) return SYSTEM_AGENT_SELECT_VALUE;
    if (agents.some((a) => a.id === id)) return id;
    return SYSTEM_AGENT_SELECT_VALUE;
  }, [selectedAgentId, agents]);

  return (
    <Select.Root
      disabled={genState !== "idle" || agentsLoading}
      value={agentSelectValue}
      onValueChange={(v) => {
        if (v === SYSTEM_AGENT_SELECT_VALUE) onSelectAgent(null);
        else onSelectAgent(v);
      }}
    >
      <Select.Trigger className={triggerCls}>
        <Bot className="h-3.5 w-3.5 shrink-0 opacity-55" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">
          <Select.Value placeholder={SYSTEM_AGENT_LABEL} />
        </span>
        <Select.Icon aria-hidden>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-55" />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          collisionPadding={12}
          className="ui-radix-floating z-[9999] max-h-[min(16rem,calc(100vh-6rem))] min-w-[10.5rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          <Select.Viewport className="max-h-[min(15rem,calc(100vh-8rem))] p-1">
            <Select.Item
              value={SYSTEM_AGENT_SELECT_VALUE}
              className="relative cursor-pointer select-none rounded-lg px-2.5 py-2 text-xs outline-none data-[highlighted]:bg-gray-50"
            >
              <Select.ItemText>{SYSTEM_AGENT_LABEL}</Select.ItemText>
              <Select.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2">
                <Check className="h-3.5 w-3.5" />
              </Select.ItemIndicator>
            </Select.Item>
            {agents.map((a) => (
              <Select.Item
                key={a.id}
                value={a.id}
                className="relative cursor-pointer select-none rounded-lg px-2.5 py-2 text-xs outline-none data-[highlighted]:bg-gray-50"
              >
                <Select.ItemText className="line-clamp-2">{a.name}</Select.ItemText>
                <Select.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2">
                  <Check className="h-3.5 w-3.5" />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
