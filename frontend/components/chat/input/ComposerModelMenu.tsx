/**
 * @fileoverview 输入栏模型菜单：联网设置 + 模型列表（Cursor 式悬浮编辑）。
 */
"use client";

import { useMemo, useRef, useState } from "react";
import clsx from "clsx";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Globe, Pencil, Sparkles } from "lucide-react";
import type { GenerationState } from "@/types/chat";
import type { CatalogModelOption, ChatModelCatalogResponse } from "@/types/models";

const MODEL_PICK_SEP = "\u001f";

const menuPanelCls =
  "ui-radix-floating overflow-hidden rounded-lg border-2 border-gray-200 bg-white py-1 shadow-lg outline-none";
const menuSectionLabelCls = "px-2 pb-1 pt-2 text-[11px] font-medium text-gray-400";
const menuToggleRowCls = "flex items-center justify-between gap-2 px-2 py-1.5";
const menuToggleLabelCls = "text-xs font-medium text-gray-900";
const menuHintCls = "px-2 text-[10px] text-gray-400";
const menuHintInlineCls = "text-[10px] text-gray-400";

const pillTriggerCls =
  "inline-flex max-w-[min(11rem,42vw)] shrink-0 items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none transition-colors hover:bg-gray-100 disabled:opacity-45 sm:max-w-[14rem] sm:px-3";

type ComposerModelMenuProps = {
  genState: GenerationState;
  modelCatalog: ChatModelCatalogResponse | null;
  selectedProviderId: string;
  selectedModelId: string;
  onSelectModel: (providerId: string, modelId: string) => void;
  deepThinkEnabled: boolean;
  onToggleDeepThink: () => void;
  deepThinkDisabledByModel: boolean;
  webSearchEnabled: boolean;
  webSearchMode: "force" | "auto";
  onToggleWebSearch: () => void;
  onSetWebSearchMode: (mode: "force" | "auto") => void;
  webSearchDisabledByModel: boolean;
};

function ToggleSwitch({
  checked,
  disabled,
  onToggle,
  activeClassName = "bg-gray-900",
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  activeClassName?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={clsx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/25",
        checked ? activeClassName : "bg-gray-200",
        disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

type ModelMenuRowProps = {
  providerId: string;
  providerConfigured: boolean;
  model: CatalogModelOption;
  selected: boolean;
  disabled: boolean;
  deepThinkEnabled: boolean;
  deepThinkDisabledByModel: boolean;
  onSelectModel: (providerId: string, modelId: string) => void;
  onToggleDeepThink: () => void;
};

function ModelMenuRow({
  providerId,
  providerConfigured,
  model,
  selected,
  disabled,
  deepThinkEnabled,
  deepThinkDisabledByModel,
  onSelectModel,
  onToggleDeepThink,
}: ModelMenuRowProps) {
  const [subOpen, setSubOpen] = useState(false);
  const openFromClickRef = useRef(false);

  const modelSupportsThink = model.capabilities?.supports_deep_think !== false;
  const thinkToggleDisabled =
    disabled || !modelSupportsThink || (selected && deepThinkDisabledByModel);

  const ensureSelected = () => {
    if (!selected) onSelectModel(providerId, model.id);
  };

  const openSubFromClick = () => {
    openFromClickRef.current = true;
    ensureSelected();
    setSubOpen(true);
  };

  const toggleSubFromClick = () => {
    if (subOpen) {
      openFromClickRef.current = false;
      setSubOpen(false);
      return;
    }
    openSubFromClick();
  };

  return (
    <div
      className={clsx(
        "group relative mx-0 flex items-center rounded-lg",
        !providerConfigured || disabled ? "opacity-45" : "hover:bg-gray-50",
      )}
    >
      <DropdownMenu.Item
        disabled={!providerConfigured || disabled}
        className={clsx(
          "flex min-w-0 flex-1 cursor-pointer select-none items-center rounded-lg py-1.5 pl-2 text-sm outline-none focus:bg-gray-50 data-[disabled]:pointer-events-none",
          providerConfigured && !disabled ? "pr-1" : "pr-2",
        )}
        onSelect={() => onSelectModel(providerId, model.id)}
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">
          {model.full_label ?? model.label}
        </span>
      </DropdownMenu.Item>

      {providerConfigured && !disabled ? (
        <div className="flex shrink-0 items-center gap-2 pr-2">
          <DropdownMenu.Sub
            open={subOpen}
            onOpenChange={(open) => {
              if (open) {
                if (!openFromClickRef.current) return;
                setSubOpen(true);
                return;
              }
              openFromClickRef.current = false;
              setSubOpen(false);
            }}
          >
            <DropdownMenu.SubTrigger
              className={clsx(
                "hidden items-center gap-0.5 rounded px-0.5 py-0.5 text-[11px] font-medium text-gray-500 outline-none",
                "hover:bg-gray-100 hover:text-gray-800",
                "group-hover:flex data-[state=open]:flex",
              )}
            onPointerEnter={(e) => e.preventDefault()}
            onPointerMove={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onSelect={(e) => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleSubFromClick();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              openSubFromClick();
            }}
          >
            <Pencil className="h-3 w-3" aria-hidden />
            编辑
          </DropdownMenu.SubTrigger>
          <DropdownMenu.Portal>
            <DropdownMenu.SubContent
              sideOffset={8}
              className={clsx(
                menuPanelCls,
                "z-[120] w-max min-w-[10rem] max-w-[calc(100vw-0.5rem)]",
              )}
            >
              <DropdownMenu.Label className={menuSectionLabelCls}>选项</DropdownMenu.Label>
              <div className={menuToggleRowCls}>
                <span className={menuToggleLabelCls}>深度思考</span>
                <ToggleSwitch
                  checked={selected && deepThinkEnabled}
                  disabled={thinkToggleDisabled}
                  onToggle={() => {
                    ensureSelected();
                    onToggleDeepThink();
                  }}
                />
              </div>
              {!modelSupportsThink ? (
                <p className={clsx(menuHintCls, "pb-1")}>该模型不支持深度思考</p>
              ) : null}
            </DropdownMenu.SubContent>
          </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          {selected ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-gray-700" strokeWidth={2.5} aria-hidden />
          ) : null}
        </div>
      ) : selected ? (
        <Check
          className="mr-2 h-3.5 w-3.5 shrink-0 text-gray-700"
          strokeWidth={2.5}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

/** 模型选择与能力开关合一的下拉菜单。 */
export function ComposerModelMenu({
  genState,
  modelCatalog,
  selectedProviderId,
  selectedModelId,
  onSelectModel,
  deepThinkEnabled,
  onToggleDeepThink,
  deepThinkDisabledByModel,
  webSearchEnabled,
  webSearchMode,
  onToggleWebSearch,
  onSetWebSearchMode,
  webSearchDisabledByModel,
}: ComposerModelMenuProps) {
  const disabled = genState !== "idle";

  const selectedProv = modelCatalog?.providers.find(
    (p) => p.id === selectedProviderId.trim(),
  );
  const selectedRow = selectedProv?.models.find(
    (m) => m.id === selectedModelId.trim(),
  );

  const pickValue = useMemo(() => {
    if (selectedProviderId.trim() && selectedModelId.trim()) {
      return `${selectedProviderId.trim()}${MODEL_PICK_SEP}${selectedModelId.trim()}`;
    }
    if (!modelCatalog?.providers?.length) return "";
    const p =
      modelCatalog.providers.find((x) => x.configured) ??
      modelCatalog.providers[0];
    const m = p?.models.find((x) => x.default) ?? p?.models[0];
    if (!p?.id || !m?.id) return "";
    return `${p.id}${MODEL_PICK_SEP}${m.id}`;
  }, [modelCatalog, selectedProviderId, selectedModelId]);

  const label = selectedRow
    ? (selectedRow.full_label ?? selectedRow.label)
    : modelCatalog?.providers?.length
      ? "选择模型"
      : "默认模型";

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild disabled={disabled && !modelCatalog?.providers?.length}>
        <button type="button" className={pillTriggerCls} disabled={disabled}>
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-55" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className={clsx(
            menuPanelCls,
            "z-[100] w-max min-w-[14rem] max-w-[calc(100vw-0.5rem)]",
          )}
        >
          {/* 联网搜索 — 最上端（紧凑） */}
          <div className="border-b border-gray-100">
            <div className={menuToggleRowCls}>
              <div className="flex min-w-0 items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
                <div className="min-w-0 leading-tight">
                  <div className={menuToggleLabelCls}>联网搜索</div>
                  <div className={menuHintInlineCls}>
                    {webSearchDisabledByModel ? "当前模型不支持" : "检索公开网页资料"}
                  </div>
                </div>
              </div>
              <ToggleSwitch
                checked={webSearchEnabled}
                disabled={disabled || webSearchDisabledByModel}
                onToggle={onToggleWebSearch}
                activeClassName="bg-emerald-600"
              />
            </div>
            {webSearchEnabled && !webSearchDisabledByModel ? (
              <div className="flex gap-1 px-2 pb-1.5">
                {(["auto", "force"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSetWebSearchMode(mode)}
                    className={clsx(
                      "flex-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                      webSearchMode === mode
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    {mode === "auto" ? "自动" : "手动"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* 模型列表 */}
          <DropdownMenu.Label className={menuSectionLabelCls}>
            对话模型
          </DropdownMenu.Label>
          <div className="max-h-[min(16rem,40vh)] overflow-y-auto pb-1">
            {!modelCatalog?.providers?.length ? (
              <p className="px-2 py-2 text-xs text-gray-500">使用服务端默认模型</p>
            ) : (
              modelCatalog.providers.map((prov) => (
                <div key={prov.id} className="mb-1">
                  <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {prov.label}
                    {!prov.configured ? " · 未配置 KEY" : ""}
                  </div>
                  {prov.models.map((m) => {
                    const value = `${prov.id}${MODEL_PICK_SEP}${m.id}`;
                    const selected = pickValue === value;
                    return (
                      <ModelMenuRow
                        key={value}
                        providerId={prov.id}
                        providerConfigured={prov.configured}
                        model={m}
                        selected={selected}
                        disabled={disabled}
                        deepThinkEnabled={deepThinkEnabled}
                        deepThinkDisabledByModel={deepThinkDisabledByModel}
                        onSelectModel={onSelectModel}
                        onToggleDeepThink={onToggleDeepThink}
                      />
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
