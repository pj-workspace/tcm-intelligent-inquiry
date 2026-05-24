/**
 * @fileoverview `brainstorm-utils` 单元测试：trace 标题与工具步骤标签。
 */
import { describe, expect, it } from "vitest";
import type { BrainstormStep } from "@/types/brainstorm";
import {
  streamingTraceHeadline,
  summarizeTraceHeadline,
  toolAbortedLabel,
  toolFailureLabel,
} from "@/lib/brainstorm-utils";

/** 构造测试用 thinking 步骤。 */
const thinking = (id = "t1", durationSec?: number): BrainstormStep => ({
  id,
  type: "thinking",
  content: "let me think",
  durationSec,
});

/** 构造测试用 tool 步骤。 */
const tool = (
  name: string,
  status: "running" | "success" | "error" = "success",
  mcpRemoteName?: string,
): BrainstormStep => ({
  id: `tool-${name}-${status}`,
  type: "tool",
  toolName: name,
  mcpRemoteName,
  status,
});

describe("summarizeTraceHeadline", () => {
  it("returns 完成 for empty steps", () => {
    expect(summarizeTraceHeadline([])).toBe("完成");
  });

  it("returns 思考过程 when only thinking steps exist", () => {
    expect(summarizeTraceHeadline([thinking(), thinking("t2", 1)])).toBe(
      "思考过程",
    );
  });

  it("includes duration when provided", () => {
    expect(summarizeTraceHeadline([thinking()], 12.4)).toBe(
      "思考过程 · 12s",
    );
  });

  it("single tool shows tool name", () => {
    expect(
      summarizeTraceHeadline(
        [tool("mcp_abc_search_pubmed", "success", "search_pubmed")],
        4,
      ),
    ).toBe("调用了 search_pubmed · 4s");
  });

  it("multiple same tools collapse to N 次", () => {
    expect(
      summarizeTraceHeadline(
        [
          tool("mcp_a_search_pubmed", "success", "search_pubmed"),
          tool("mcp_a_search_pubmed", "success", "search_pubmed"),
          tool("mcp_a_search_pubmed", "success", "search_pubmed"),
        ],
        5,
      ),
    ).toBe("调用了 search_pubmed 3 次 · 5s");
  });

  it("multiple distinct tools shows count", () => {
    expect(
      summarizeTraceHeadline(
        [
          tool("mcp_a_search_pubmed", "success", "search_pubmed"),
          tool("mcp_a_send_mail", "success", "send_mail"),
        ],
        8,
      ),
    ).toBe("用了 2 个工具 · 8s");
  });

});

describe("toolAbortedLabel", () => {
  it("renders 「已终止」 with MCP 远端名优先", () => {
    expect(toolAbortedLabel("mcp_a_search_pubmed", "search_pubmed")).toBe(
      "search_pubmed 已终止",
    );
  });

  it("falls back to internal tool name when remote name missing", () => {
    expect(toolAbortedLabel("search_tcm_knowledge")).toContain("已终止");
  });

  it("differs from failure label (区分主动终止与业务失败)", () => {
    const aborted = toolAbortedLabel("mcp_a_x", "x");
    const failed = toolFailureLabel("mcp_a_x", "x");
    expect(aborted).not.toBe(failed);
  });
});

describe("streamingTraceHeadline", () => {
  it("returns running tool label when a tool is running", () => {
    const label = streamingTraceHeadline([
      thinking("t1", 1),
      tool("mcp_a_search_pubmed", "running", "search_pubmed"),
    ]);
    expect(label).toContain("search_pubmed");
  });

  it("falls back to 思考中... when an open thinking step exists", () => {
    expect(streamingTraceHeadline([thinking("t1")])).toBe("思考中...");
  });

  it("falls back to 处理中... when steps are quiescent", () => {
    expect(
      streamingTraceHeadline([
        thinking("t1", 2),
        tool("mcp_a_search_pubmed", "success", "search_pubmed"),
      ]),
    ).toBe("处理中...");
  });

  it("ignores stale preparing when latest user_input was dismissed", () => {
    expect(
      streamingTraceHeadline([
        {
          id: "ui-preparing",
          type: "user_input",
          widgetId: "pending-1",
          question: "正在准备问题",
          status: "preparing",
        },
        {
          id: "ui-dismissed",
          type: "user_input",
          widgetId: "w-1",
          question: "请输入学号和密码",
          status: "dismissed",
        },
        tool("jxnu.auth.status", "running", "jxnu.auth.status"),
      ]),
    ).toContain("jxnu.auth.status");
  });
});
