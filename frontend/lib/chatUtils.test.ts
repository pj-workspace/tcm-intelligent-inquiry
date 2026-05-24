/**
 * @fileoverview `chatUtils` 单元测试：消息分组、API 行映射与引用来源归一化。
 */
import { describe, expect, it } from "vitest";
import {
  groupMessagesIntoTraces,
  mapApiRowToMessage,
  normalizeCitationSources,
} from "@/lib/chatUtils";
import type { ApiMessageRow, FlatMessage } from "@/types/chat";

/** 构造测试用用户消息。 */
const userMsg = (id: string, content = "hi"): FlatMessage => ({
  id,
  role: "user",
  type: "message",
  content,
});

/** 构造测试用助手消息。 */
const assistantMsg = (id: string, content: string): FlatMessage => ({
  id,
  role: "assistant",
  type: "message",
  content,
});

/** 构造测试用 thinking 步骤。 */
const thinkingStep = (id: string, content = "think"): FlatMessage => ({
  id,
  type: "thinking",
  content,
});

/** 构造测试用 tool 步骤。 */
const toolStep = (id: string): FlatMessage => ({
  id,
  type: "tool",
  toolName: "search",
  status: "success",
  outputPreview: "ok",
});

/** 构造测试用 summary-mark 步骤。 */
const summaryMark = (id: string): FlatMessage => ({
  id,
  type: "summary-mark",
});

/** 构造测试用 interrupt-mark 步骤。 */
const interruptMark = (id: string): FlatMessage => ({
  id,
  type: "interrupt-mark",
});

describe("groupMessagesIntoTraces", () => {
  it("renders no trace for plain user+assistant", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      assistantMsg("a1", "answer"),
    ]);
    expect(out.map((m) => m.type)).toEqual(["message", "message"]);
  });

  it("collects consecutive thinking/tool into a single trace, then assistant", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      toolStep("to1"),
      assistantMsg("a1", "final"),
    ]);
    expect(out.map((m) => m.type)).toEqual(["message", "trace", "message"]);
    const trace = out[1];
    if (trace.type !== "trace") throw new Error("expected trace");
    expect(trace.steps.map((s) => s.type)).toEqual(["thinking", "tool"]);
    // 新行为：trace 默认折叠（与流式 finalize 一致），用户可手动展开
    expect(trace.collapsed).toBe(true);
  });

  it("multi-trace / multi-assistant layout: each tool segment gets its own trace", () => {
    // 截图杂乱样式：thinking/tool → assistant 过渡话 → tool → assistant 最终答复
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      toolStep("to1"),
      assistantMsg("a1", "let me search"),
      toolStep("to2"),
      assistantMsg("a2", "final answer"),
    ]);
    expect(out.map((m) => m.type)).toEqual([
      "message",
      "trace",
      "message",
      "trace",
      "message",
    ]);
    const trace1 = out[1];
    const trace2 = out[3];
    if (trace1.type !== "trace" || trace2.type !== "trace")
      throw new Error("expected two traces");
    expect(trace1.steps.map((s) => s.type)).toEqual(["thinking", "tool"]);
    expect(trace2.steps.map((s) => s.type)).toEqual(["tool"]);
    const last = out[4];
    if (last.type !== "message" || last.role !== "assistant")
      throw new Error("expected final assistant");
    expect(last.content).toBe("final answer");
  });

  it("handles two rounds independently", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      assistantMsg("a1", "round1 final"),
      userMsg("u2"),
      thinkingStep("t2"),
      assistantMsg("a2", "round2 final"),
    ]);
    expect(out.map((m) => m.type)).toEqual([
      "message",
      "trace",
      "message",
      "message",
      "trace",
      "message",
    ]);
  });

  it("form widget inside trace does not crash on traceId", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      toolStep("tool1"),
      {
        id: "w-form1",
        type: "widget",
        widgetType: "form",
        question: "请填写学号与密码",
        fields: [
          { name: "student_id", label: "学号", type: "text" },
          { name: "password", label: "密码", type: "password" },
        ],
      },
      userMsg("u2", "【用户已通过表单提交敏感信息】"),
    ]);
    expect(out.some((m) => m.type === "widget" && m.id === "w-form1")).toBe(true);
    const formWidget = out.find(
      (m) => m.type === "widget" && m.id === "w-form1",
    );
    if (!formWidget || formWidget.type !== "widget" || formWidget.widgetType !== "form") {
      throw new Error("expected form widget");
    }
    expect(formWidget.submitted).toBe(true);
    expect(formWidget.traceId).toMatch(/^trace-/);
  });

  it("trailing assistant with no steps stays as plain message", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      assistantMsg("a1", "hi"),
    ]);
    expect(out).toHaveLength(2);
    expect(out[1].type).toBe("message");
  });

  it("computes trace totalDurationSec from first step to following assistant createdAt", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      {
        id: "t1",
        type: "thinking",
        content: "thinking",
        createdAt: "2026-05-21T12:00:00Z",
      } as FlatMessage,
      {
        id: "to1",
        type: "tool",
        toolName: "search",
        status: "success",
        outputPreview: "ok",
        createdAt: "2026-05-21T12:00:30Z",
      } as FlatMessage,
      {
        id: "a1",
        role: "assistant",
        type: "message",
        content: "done",
        createdAt: "2026-05-21T12:01:00Z",
      },
    ]);
    const trace = out[1];
    if (trace.type !== "trace") throw new Error("expected trace");
    // First step 12:00:00 → 紧随的 assistant 12:01:00 → 60s
    expect(trace.totalDurationSec).toBe(60);
  });

  it("falls back to sum of thinking durations when createdAt missing", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      {
        id: "t1",
        type: "thinking",
        content: "x",
        durationSec: 4,
      } as FlatMessage,
      assistantMsg("a1", "ok"),
    ]);
    const trace = out[1];
    if (trace.type !== "trace") throw new Error("expected trace");
    expect(trace.totalDurationSec).toBe(4);
  });

  it("showTrace=false drops all thinking/tool messages, keeps message/widget only", () => {
    const out = groupMessagesIntoTraces(
      [
        userMsg("u1"),
        thinkingStep("t1"),
        toolStep("to1"),
        toolStep("to2"),
        assistantMsg("a1", "final answer"),
        userMsg("u2"),
        toolStep("to3"),
        assistantMsg("a2", "answer 2"),
      ],
      { showTrace: false },
    );
    expect(out.map((m) => m.type)).toEqual([
      "message",
      "message",
      "message",
      "message",
    ]);
    expect(out.filter((m) => m.type === "message").map((m) => (m as { role: string }).role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
  });

  it("showTrace defaults to true (backward compatible)", () => {
    const outDefault = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      assistantMsg("a1", "ok"),
    ]);
    expect(outDefault.some((m) => m.type === "trace")).toBe(true);
  });

  it("preserves aborted flag when mapping persisted tool record", () => {
    const row: ApiMessageRow = {
      id: "to-abort",
      role: "tool",
      content: JSON.stringify({
        name: "mcp_x_search_pubmed",
        mcpRemoteName: "search_pubmed",
        runId: "r1",
        status: "error",
        aborted: true,
        outputPreview: "已终止",
      }),
    };
    const mapped = mapApiRowToMessage(row);
    if (mapped.type !== "tool") throw new Error("expected tool step");
    expect(mapped.status).toBe("error");
    expect(mapped.aborted).toBe(true);
    expect(mapped.outputPreview).toBe("已终止");
  });

  it("trace inherits aborted=true when any tool step was aborted", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      {
        id: "to1",
        type: "tool",
        toolName: "mcp_x_search",
        status: "error",
        aborted: true,
        outputPreview: "已终止",
      } as FlatMessage,
      assistantMsg("a1", "中断后的回应"),
    ]);
    const trace = out[1];
    if (trace.type !== "trace") throw new Error("expected trace");
    expect(trace.aborted).toBe(true);
  });

  it("trace has no aborted flag when all tools completed normally", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      toolStep("to1"),
      assistantMsg("a1", "ok"),
    ]);
    const trace = out[1];
    if (trace.type !== "trace") throw new Error("expected trace");
    expect(trace.aborted).toBeUndefined();
  });

  it("historical traces without summary-mark have no summaryAcknowledged", () => {
    // 没有 summary-mark 记录的会话历史（非 think 模式 / 模型未调用 mark_summary）
    // → trace.summaryAcknowledged 应为 undefined，footer 不显示「完成」
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      toolStep("to1"),
      assistantMsg("a1", "最终答案"),
    ]);
    const trace = out[1];
    if (trace.type !== "trace") throw new Error("expected trace");
    expect(trace.summaryAcknowledged).toBeUndefined();
  });

  it("summary-mark before flush attaches to in-progress trace", () => {
    // think 模式典型回放：thinking → tool → summary-mark → assistant 最终答
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      toolStep("to1"),
      summaryMark("sm1"),
      assistantMsg("a1", "最终答案"),
    ]);
    expect(out.map((m) => m.type)).toEqual(["message", "trace", "message"]);
    const trace = out[1];
    if (trace.type !== "trace") throw new Error("expected trace");
    expect(trace.summaryAcknowledged).toBe(true);
  });

  it("summary-mark after trace flush retroactively marks last trace", () => {
    // 罕见 case：mark_summary 之后又有新的 thinking/tool（模型抽风），summary-mark
    // 出现在 trace 已 flush 之后，应回写到 grouped 数组里最近一个 trace 上
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      assistantMsg("a1", "中间过渡"),
      summaryMark("sm1"),
    ]);
    expect(out.map((m) => m.type)).toEqual(["message", "trace", "message"]);
    const trace = out[1];
    if (trace.type !== "trace") throw new Error("expected trace");
    expect(trace.summaryAcknowledged).toBe(true);
  });

  it("summary-mark never appears as a standalone message in grouped output", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      summaryMark("sm1"),
      assistantMsg("a1", "ans"),
    ]);
    // 不应出现 type:"summary-mark" 的顶层消息
    expect(out.some((m) => (m as { type: string }).type === "summary-mark")).toBe(
      false,
    );
  });

  it("mapApiRowToMessage recognizes role=summary-mark and emits summary-mark", () => {
    const row: ApiMessageRow = {
      id: "sm-row-1",
      role: "summary-mark",
      content: "",
      created_at: "2026-05-22T08:30:00Z",
    };
    const mapped = mapApiRowToMessage(row);
    expect(mapped.type).toBe("summary-mark");
    expect(mapped.id).toBe("sm-row-1");
  });

  it("mapApiRowToMessage recognizes role=interrupt-mark and emits interrupt-mark", () => {
    const row: ApiMessageRow = {
      id: "im-row-1",
      role: "interrupt-mark",
      content: "",
      created_at: "2026-05-22T08:30:05Z",
    };
    const mapped = mapApiRowToMessage(row);
    expect(mapped.type).toBe("interrupt-mark");
    expect(mapped.id).toBe("im-row-1");
  });

  it("interrupt-mark marks the previous assistant message interrupted", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      assistantMsg("a1", "回答到一半..."),
      interruptMark("im1"),
    ]);
    expect(out.map((m) => m.type)).toEqual(["message", "trace", "message"]);
    const lastAi = out[2];
    if (lastAi.type !== "message" || lastAi.role !== "assistant") {
      throw new Error("expected assistant message");
    }
    expect(lastAi.interrupted).toBe(true);
  });

  it("interrupt-mark with no prior assistant adds an empty interrupted placeholder", () => {
    // 罕见 case：abort 发生在 trace 阶段、还没产生任何 assistant 文本
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      thinkingStep("t1"),
      interruptMark("im1"),
    ]);
    // 末尾应该有一条 interrupted=true 的空 assistant 占位
    const last = out[out.length - 1];
    if (last.type !== "message" || last.role !== "assistant") {
      throw new Error("expected interrupted placeholder bubble");
    }
    expect(last.interrupted).toBe(true);
    expect(last.content).toBe("");
  });

  it("interrupt-mark never appears as a standalone message in grouped output", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      assistantMsg("a1", "回答"),
      interruptMark("im1"),
    ]);
    expect(out.some((m) => (m as { type: string }).type === "interrupt-mark")).toBe(
      false,
    );
  });

  it("interrupt-mark does NOT cross user boundary into prior round", () => {
    // 多轮场景：第一轮成功，第二轮 abort 时只有 trace 没出文本
    // → 上一轮的 a1 不应被标 interrupted；本轮应追加占位气泡
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      assistantMsg("a1", "第一轮回答（完整）"),
      userMsg("u2"),
      thinkingStep("t1"),
      interruptMark("im1"),
    ]);
    // 第一轮 a1 不应被标 interrupted（不能跨 user 边界）
    const a1 = out.find(
      (m) => m.type === "message" && m.role === "assistant" && m.id === "a1",
    );
    if (!a1 || a1.type !== "message") throw new Error("expected a1");
    expect(a1.interrupted).toBeUndefined();
    // 最后应该有一条新的 interrupted=true 空 assistant 占位
    const last = out[out.length - 1];
    if (last.type !== "message" || last.role !== "assistant") {
      throw new Error("expected interrupted placeholder bubble at tail");
    }
    expect(last.interrupted).toBe(true);
    expect(last.content).toBe("");
    expect(last.id).not.toBe("a1");
  });

  it("normal failed tool record has no aborted flag set", () => {
    const row: ApiMessageRow = {
      id: "to-err",
      role: "tool",
      content: JSON.stringify({
        name: "mcp_x_search_pubmed",
        mcpRemoteName: "search_pubmed",
        status: "error",
        outputPreview: "网络错误",
      }),
    };
    const mapped = mapApiRowToMessage(row);
    if (mapped.type !== "tool") throw new Error("expected tool step");
    expect(mapped.status).toBe("error");
    expect(mapped.aborted).toBeUndefined();
  });

  it("maps assistant citations from history rows", () => {
    const row: ApiMessageRow = {
      id: "a-cite",
      role: "assistant",
      content: "结论【K1】",
      created_at: "2026-05-23T08:00:00Z",
      citations: [
        {
          id: "K1",
          kind: "knowledge",
          title: "伤寒论片段",
          source: "shanghan.pdf",
          snippet: "太阳病，桂枝汤主之。",
        },
      ],
    };
    const mapped = mapApiRowToMessage(row);
    if (mapped.type !== "message" || mapped.role !== "assistant") {
      throw new Error("expected assistant message");
    }
    expect(mapped.citations?.[0]?.id).toBe("K1");
  });

  it("normalizes citation sources and drops malformed entries", () => {
    expect(
      normalizeCitationSources([
        { id: "K1", kind: "knowledge", title: "ok" },
        { id: "X1", kind: "bad", title: "bad" },
        { id: "", kind: "web", title: "bad" },
      ]),
    ).toEqual([{ id: "K1", kind: "knowledge", title: "ok" }]);
  });

  it("sequential assistants without steps stay as separate top-level messages", () => {
    const out = groupMessagesIntoTraces([
      userMsg("u1"),
      assistantMsg("a1", "first attempt"),
      assistantMsg("a2", "second attempt"),
      assistantMsg("a3", "final"),
    ]);
    expect(out.map((m) => m.type)).toEqual([
      "message",
      "message",
      "message",
      "message",
    ]);
  });
});
