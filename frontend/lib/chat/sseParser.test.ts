import { describe, expect, it } from "vitest";
import {
  KNOWN_SSE_EVENT_TYPES,
  isKnownSseEventType,
  parseSseDataLine,
  parseSseFrameBuffer,
  sseEventType,
} from "./sseParser";

describe("parseSseDataLine", () => {
  it("parses [DONE]", () => {
    expect(parseSseDataLine("[DONE]")).toEqual({ kind: "done" });
  });

  it("parses meta json", () => {
    const r = parseSseDataLine(
      '{"type":"meta","conversationId":"c1","safetyNotice":"s"}',
    );
    expect(r.kind).toBe("json");
    if (r.kind === "json") {
      expect(sseEventType(r.data)).toBe("meta");
      expect(r.data.conversationId).toBe("c1");
    }
  });

  it("returns invalid for bad json", () => {
    expect(parseSseDataLine("{")).toEqual({ kind: "invalid" });
  });
});

describe("KNOWN_SSE_EVENT_TYPES", () => {
  it("matches backend contract set", () => {
    for (const t of [
      "notice",
      "meta",
      "text-delta",
      "thinking-delta",
      "ask-user-start",
      "tool-call",
      "tool-result",
      "source-registry",
      "summary-start",
      "widget",
      "title-updated",
      "llm-usage",
      "error",
    ]) {
      expect(isKnownSseEventType(t)).toBe(true);
    }
    expect(KNOWN_SSE_EVENT_TYPES).toHaveLength(13);
  });

  it("summary-start 是 think 模式 mark_summary 工具触发的内部信号", () => {
    expect(isKnownSseEventType("summary-start")).toBe(true);
  });
});

describe("parseSseFrameBuffer", () => {
  it("splits frames on double newline", () => {
    const buf =
      'data: {"type":"text-delta","textDelta":"a"}\n\n' +
      'data: {"type":"text-delta","textDelta":"b"}\n\n';
    const { remainder, events } = parseSseFrameBuffer(buf);
    expect(remainder).toBe("");
    expect(events.filter((e) => e.kind === "json")).toHaveLength(2);
  });
});
