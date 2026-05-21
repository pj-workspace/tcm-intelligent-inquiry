import { describe, expect, it } from "vitest";
import { groupMessagesIntoTraces, mapApiRowToMessage } from "@/lib/chatUtils";
import type { ApiMessageRow, FlatMessage } from "@/types/chat";

const userMsg = (id: string, content = "hi"): FlatMessage => ({
  id,
  role: "user",
  type: "message",
  content,
});

const assistantMsg = (id: string, content: string): FlatMessage => ({
  id,
  role: "assistant",
  type: "message",
  content,
});

const thinkingStep = (id: string, content = "think"): FlatMessage => ({
  id,
  type: "thinking",
  content,
});

const toolStep = (id: string): FlatMessage => ({
  id,
  type: "tool",
  toolName: "search",
  status: "success",
  outputPreview: "ok",
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

  it("historical traces have no summaryAcknowledged (footer 不显示 完成)", () => {
    // 后端目前不持久化 mark_summary 信号，刷新历史时 summaryAcknowledged 一律 undefined
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
