"use client";

import { useMemo } from "react";
import clsx from "clsx";
import * as HoverCard from "@radix-ui/react-hover-card";
import * as Select from "@radix-ui/react-select";
import { Bot, Brain, Check, ChevronDown } from "lucide-react";
import {
  SYSTEM_AGENT_LABEL,
  SYSTEM_AGENT_SELECT_VALUE,
} from "@/lib/chatAgentConstants";
import type { GenerationState } from "@/types/chat";
import type { ChatModelCatalogResponse } from "@/types/models";

const MODEL_PICK_SEP = "\u001f";

type ModelAgentPickerProps = {
  genState: GenerationState;
  modelCatalog: ChatModelCatalogResponse | null;
  selectedProviderId: string;
  selectedModelId: string;
  onSelectModel: (providerId: string, modelId: string) => void;
  showAgentPicker?: boolean;
  agents?: { id: string; name: string }[];
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string | null) => void;
  agentsLoading?: boolean;
};

export function ModelAgentPicker({
  genState,
  modelCatalog,
  selectedProviderId,
  selectedModelId,
  onSelectModel,
  showAgentPicker = false,
  agents = [],
  selectedAgentId = null,
  onSelectAgent,
  agentsLoading = false,
}: ModelAgentPickerProps) {
  const selectedProv = modelCatalog?.providers.find(
    (p) => p.id === selectedProviderId.trim(),
  );
  const selectedRow = selectedProv?.models.find(
    (m) => m.id === selectedModelId.trim(),
  );

  const fallbackPickValue = useMemo(() => {
    if (!modelCatalog?.providers?.length) return "";
    const p =
      modelCatalog.providers.find((x) => x.configured) ??
      modelCatalog.providers[0];
    const m = p?.models.find((x) => x.default) ?? p?.models[0];
    if (!p?.id || !m?.id) return "";
    return `${p.id}${MODEL_PICK_SEP}${m.id}`;
  }, [modelCatalog]);

  const pickValue =
    selectedProviderId.trim() && selectedModelId.trim()
      ? `${selectedProviderId.trim()}${MODEL_PICK_SEP}${selectedModelId.trim()}`
      : "";

  const selectCompositeValue = pickValue || fallbackPickValue;

  return (
    <>
                    {showAgentPicker && onSelectAgent && (
                      <div className="max-w-[min(20rem,46vw)] shrink-0">
                        <Select.Root
                          disabled={genState !== "idle" || agentsLoading}
                          value={
                            selectedAgentId?.trim()
                              ? selectedAgentId.trim()
                              : SYSTEM_AGENT_SELECT_VALUE
                          }
                          onValueChange={(v) => {
                            if (v === SYSTEM_AGENT_SELECT_VALUE) onSelectAgent(null);
                            else onSelectAgent(v);
                          }}
                        >
                          <Select.Trigger className="flex w-full max-w-[min(20rem,46vw)] items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-gray-800 outline-none transition-colors hover:bg-gray-100 focus-visible:border-gray-300 disabled:opacity-45">
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
                              sideOffset={6}
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
                      </div>
                    )}

                    {!modelCatalog?.providers?.length ? (
                      <span
                        className="truncate rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 opacity-75"
                        title="使用服务端配置的默认对话模型（未获取到模型目录）"
                      >
                        默认模型
                      </span>
                    ) : (
                      <div className="max-w-[min(20rem,46vw)] shrink-0">
                        <Select.Root
                          disabled={genState !== "idle"}
                          value={selectCompositeValue || undefined}
                          onValueChange={(v) => {
                            const i = v.indexOf(MODEL_PICK_SEP);
                            if (i <= 0) return;
                            onSelectModel(v.slice(0, i), v.slice(i + MODEL_PICK_SEP.length));
                          }}
                        >
                          <Select.Trigger className="flex w-full max-w-[min(20rem,46vw)] items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-gray-800 outline-none transition-colors hover:bg-gray-100 focus-visible:border-gray-300 disabled:opacity-45">
                            <span
                              className="min-w-0 flex-1 truncate text-left"
                              title={
                                selectedProv && selectedRow
                                  ? `${selectedProv.label} · ${selectedRow.full_label ?? selectedRow.label}`
                                  : undefined
                              }
                            >
                              {selectedRow
                                ? selectedRow.full_label ?? selectedRow.label
                                : "选择模型"}
                            </span>
                            <Select.Icon aria-hidden>
                              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-55" />
                            </Select.Icon>
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content
                              position="popper"
                              sideOffset={6}
                              collisionPadding={12}
                              className="ui-radix-floating z-[9999] max-h-[min(24rem,calc(100vh-6rem))] min-w-[min(22rem,var(--radix-select-trigger-width))] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                            >
                              <Select.Viewport className="max-h-[min(22rem,calc(100vh-8rem))] p-1">
                                {modelCatalog.providers.map((prov) => (
                                  <Select.Group key={prov.id}>
                                    <Select.Label className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                      {prov.label}
                                      {!prov.configured ? " · 未配置 KEY" : ""}
                                    </Select.Label>
                                    {prov.models.map((m) => (
                                      <Select.Item
                                        key={`${prov.id}:${m.id}`}
                                        value={`${prov.id}${MODEL_PICK_SEP}${m.id}`}
                                        disabled={!prov.configured}
                                        className="relative cursor-pointer select-none rounded-lg p-0 text-sm outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-gray-50 data-[disabled]:opacity-45"
                                      >
                                        <HoverCard.Root openDelay={220} closeDelay={80}>
                                          <HoverCard.Trigger asChild>
                                            <div className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-gray-900">
                                              <Select.ItemText asChild>
                                                <span className="flex-1 whitespace-normal text-left text-[13px] leading-snug line-clamp-2">
                                                  {m.full_label ?? m.label}
                                                </span>
                                              </Select.ItemText>
                                              <span
                                                className={clsx(
                                                  "flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums text-gray-400",
                                                  !prov.configured && "opacity-60",
                                                )}
                                              >
                                                <Brain
                                                  className="h-3.5 w-3.5 shrink-0 opacity-55"
                                                  aria-hidden
                                                />
                                                {m.speed_tag ?? "—"}
                                              </span>
                                            </div>
                                          </HoverCard.Trigger>
                                          <HoverCard.Portal>
                                            <HoverCard.Content
                                              side="right"
                                              align="start"
                                              sideOffset={12}
                                              collisionPadding={16}
                                              className="z-[10050] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-xl outline-none"
                                            >
                                              <div className="text-[15px] font-semibold leading-snug">
                                                {m.full_label ?? m.label}
                                              </div>
                                              <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-gray-500">
                                                <span>{prov.label}</span>
                                                <span className="text-gray-300">·</span>
                                                <code className="rounded bg-gray-100 px-1 py-px font-mono text-[10px] text-gray-600">
                                                  {m.id}
                                                </code>
                                              </div>
                                              {!prov.configured ? (
                                                <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs leading-snug text-amber-950">
                                                  尚未配置 API Key：请在服务端{" "}
                                                  <span className="font-mono">.env</span>{" "}
                                                  填写对应 Key 后启用。
                                                </p>
                                              ) : null}
                                              <p className="mt-3 text-xs leading-relaxed text-gray-600">
                                                {m.description}
                                              </p>
                                              {prov.id === "deepseek" && prov.configured ? (
                                                <p className="mt-2 text-[11px] leading-snug text-gray-500">
                                                  官方支持思考模式与工具调用并存；多轮请求需完整回传每步{" "}
                                                  <span className="font-mono">reasoning_content</span>
                                                  ，本项目已自动处理。
                                                </p>
                                              ) : null}
                                              {m.context_window_hint ? (
                                                <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] italic leading-snug text-gray-500">
                                                  {m.context_window_hint}
                                                </p>
                                              ) : null}
                                            </HoverCard.Content>
                                          </HoverCard.Portal>
                                        </HoverCard.Root>
                                      </Select.Item>
                                    ))}
                                  </Select.Group>
                                ))}
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>
                    )}

    </>
  );
}

