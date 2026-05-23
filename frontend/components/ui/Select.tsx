/**
 * @fileoverview 基于 Radix Select 的样式化下拉选择器。
 */
"use client";

import clsx from "clsx";
import {
  Content,
  Icon,
  Item,
  ItemIndicator,
  ItemText,
  Portal,
  Root,
  Trigger,
  Value,
  Viewport,
} from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";

/** Radix 要求 option 的 value 非空字符串时更稳定，用哨兵表示「未选 / 空」 */
const SENTINEL_EMPTY = "__tcm_select_empty__";

/** 将空字符串映射为 Radix 哨兵值，避免 value="" 不稳定。 */
function toRadixValue(v: string): string {
  return v === "" ? SENTINEL_EMPTY : v;
}

/** 将 Radix 哨兵值还原为空字符串。 */
function fromRadixValue(v: string): string {
  return v === SENTINEL_EMPTY ? "" : v;
}

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** 无匹配项或尚未选时 Trigger 内占位（一般可不用，由 value 为空的 option 承担） */
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * 基于 Radix Select 的下拉：展开列表为 Web 内联层，非系统原生菜单，可完全用 Tailwind 修饰。
 */
export function Select({
  value,
  onValueChange,
  options,
  placeholder = "请选择",
  className,
  disabled,
  id,
}: SelectProps) {
  const radixValue = toRadixValue(value);

  return (
    <Root
      value={radixValue}
      onValueChange={(v) => onValueChange(fromRadixValue(v))}
      disabled={disabled}
    >
      <Trigger
        id={id}
        className={clsx(
          "group flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 outline-none transition",
          "hover:border-gray-400 hover:bg-gray-50/90",
          "focus:border-orange-400 focus:ring-1 focus:ring-orange-400",
          "data-[state=open]:border-orange-400 data-[state=open]:ring-1 data-[state=open]:ring-orange-400",
          "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500",
          className
        )}
        aria-label={placeholder}
      >
        <Value placeholder={placeholder} className="truncate" />
        <Icon>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 group-data-[state=open]:rotate-180"
            strokeWidth={2.25}
            aria-hidden
          />
        </Icon>
      </Trigger>

      <Portal>
        <Content
          position="popper"
          sideOffset={4}
          className="ui-radix-floating z-[100] max-h-60 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-md"
        >
          <Viewport className="max-h-52 overflow-y-auto p-0.5">
            {options.map((opt) => {
              const itemValue = toRadixValue(opt.value);
              return (
                <Item
                  key={itemValue}
                  value={itemValue}
                  className={clsx(
                    "relative flex cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm text-gray-900 outline-none transition-colors",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                    "data-[highlighted]:bg-orange-50 data-[highlighted]:text-gray-900"
                  )}
                >
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <ItemIndicator>
                      <Check className="h-3.5 w-3.5 text-orange-600" strokeWidth={2.5} />
                    </ItemIndicator>
                  </span>
                  <ItemText>{opt.label}</ItemText>
                </Item>
              );
            })}
          </Viewport>
        </Content>
      </Portal>
    </Root>
  );
}
