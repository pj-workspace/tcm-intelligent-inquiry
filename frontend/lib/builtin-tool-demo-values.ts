/**
 * @fileoverview 内置工具试用表单的示例参数预填：合并 schema 默认值与演示值。
 */
import type { BuiltinToolInfo, ToolArgInfo } from "@/types/tool";

/** 工具名 → 参数名 → 示例值（仅覆盖无 schema default 或为测试方便覆盖的常见项） */
const DEMO_ARGS: Record<string, Record<string, string>> = {
  search_tcm_knowledge: {
    query: "伤寒论中太阳病提纲与桂枝汤证要点",
    top_k: "5",
    // kb_id 留空：走当前用户默认/首个自有库
  },
  formula_lookup: {
    formula_name: "麻黄汤",
  },
  recommend_formulas: {
    clinical_query: "恶寒发热、头痛、无汗、身痛、脉浮紧",
    pattern_type: "风寒表实证",
    top_k: "5",
  },
  searx_web_search: {
    query: "中医学 方剂 桂枝汤 功效",
    max_results: "10",
    language: "zh",
  },
};

/** 内置工具试用表单 schema 默认值转字符串。 */
function schemaDefaultString(arg: ToolArgInfo): string {
  if (arg.default === null || arg.default === undefined) return "";
  if (arg.type === "boolean") return String(arg.default);
  return String(arg.default);
}

/**
 * 合并：schema 默认值 + 本文件演示值（演示优先于空，不覆盖用户已有有效 schema 默认）
 */
export function buildToolInvokeInitialValues(tool: BuiltinToolInfo): Record<string, string> {
  const demos = DEMO_ARGS[tool.name] ?? {};
  const out: Record<string, string> = {};

  for (const arg of tool.args_schema) {
    const fromSchema = schemaDefaultString(arg);
    const demo = demos[arg.name];

    if (arg.type === "boolean") {
      if (demo !== undefined) {
        out[arg.name] = demo;
      } else if (fromSchema !== "") {
        out[arg.name] = fromSchema;
      } else {
        out[arg.name] = "false";
      }
      continue;
    }

    if (demo !== undefined && demo !== "") {
      out[arg.name] = demo;
      continue;
    }
    if (fromSchema !== "") {
      out[arg.name] = fromSchema;
      continue;
    }
    out[arg.name] = "";
  }
  return out;
}
