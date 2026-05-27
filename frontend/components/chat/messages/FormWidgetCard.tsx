/**
 * @fileoverview Agent `ask_user_form` 交互卡片：结构化/敏感字段收集。
 */
"use client";

import { useState, useCallback } from "react";
import { Check, Lock } from "lucide-react";
import { motion } from "framer-motion";
import type { FormFieldDef } from "@/types/chat";

interface FormWidgetCardProps {
  question: string;
  fields: FormFieldDef[];
  /** 已提交 */
  submitted?: boolean;
  disabled?: boolean;
  onSubmit: (values: Record<string, string>) => void;
}

/** 表单 Widget：收集敏感/结构化字段，提交后由后端加密存 Vault。 */
export function FormWidgetCard({
  question,
  fields,
  submitted = false,
  disabled = false,
  onSubmit,
}: FormWidgetCardProps) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, ""])),
  );
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setError(null);
  }, []);

  const handleSubmit = useCallback(() => {
    if (disabled || submitted) return;
    for (const f of fields) {
      if (f.required !== false && !(values[f.name] ?? "").trim()) {
        setError(`请填写「${f.label}」`);
        return;
      }
    }
    onSubmit(
      Object.fromEntries(
        fields.map((f) => [f.name, (values[f.name] ?? "").trim()]),
      ),
    );
  }, [disabled, submitted, fields, values, onSubmit]);

  if (submitted) {
    return (
      <div className="my-3 w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted px-4 py-3">
          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Check className="h-3 w-3 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted-foreground leading-snug">{question}</p>
            <p className="mt-0.5 text-[14px] font-medium text-foreground leading-snug">
              已提交 {fields.length} 项（敏感信息已加密，15 分钟内有效）
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-5 md:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
      >
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-[15px] font-semibold leading-snug text-foreground">
                {question}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                信息经 HTTPS 传输并加密存储，仅保留 15 分钟
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {fields.map((field) => (
            <label key={field.name} className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-foreground">
                {field.label}
                {field.required !== false ? (
                  <span className="ml-0.5 text-red-500">*</span>
                ) : null}
              </span>
              <input
                type={field.type === "password" ? "password" : field.type === "email" ? "email" : field.type === "number" ? "number" : "text"}
                name={field.name}
                autoComplete={field.type === "password" ? "off" : undefined}
                placeholder={field.placeholder || undefined}
                value={values[field.name] ?? ""}
                disabled={disabled}
                onChange={(e) => handleChange(field.name, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                className="w-full rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-border focus:bg-surface disabled:opacity-50"
              />
            </label>
          ))}
          {error ? (
            <p className="text-[12px] text-red-500">{error}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end border-t border-border px-5 py-3">
          <button
            type="button"
            disabled={disabled}
            onClick={handleSubmit}
            className="rounded-lg bg-gray-800 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-40"
          >
            提交
          </button>
        </div>
      </motion.div>
    </div>
  );
}
