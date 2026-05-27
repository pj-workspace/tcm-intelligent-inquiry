/**
 * @fileoverview 界面与偏好 Tab 共享 UI（Mock 阶段：仅本地交互，无持久化）。
 */
"use client";

import type { ReactNode } from "react";
import clsx from "clsx";

/** 设置项行：左侧标题/说明，右侧控件。 */
export function PreferenceRow({
  label,
  description,
  children,
  className,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col gap-3 border-b border-[#f2f0ec] py-4 last:border-b-0 last:pb-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 sm:max-w-md">
        <p className="text-sm font-medium text-[#1c1917]">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[13px] leading-relaxed text-gray-600">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0 sm:min-w-[12rem]">{children}</div>
    </div>
  );
}

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  ariaLabel?: string;
};

/** 三段式分段选择器（Mock）。 */
export function MockSegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      className={clsx(
        "inline-flex rounded-xl border border-[#e7e5e4] bg-[#f5f5f4] p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.ariaLabel ?? opt.label}
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
              active
                ? "bg-white text-[#1c1917] shadow-sm ring-1 ring-[#e7e5e4]"
                : "text-gray-600 hover:text-gray-900",
            )}
          >
            {opt.icon}
            <span className="sr-only sm:not-sr-only">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 开关（Mock）。 */
export function MockToggle({
  checked,
  onChange,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-7 w-12 shrink-0 rounded-full transition-colors",
        checked ? "bg-orange-500" : "bg-gray-300",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
