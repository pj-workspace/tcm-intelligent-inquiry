import { describe, expect, it } from "vitest";
import {
  buildSidebarConversationSections,
  sidebarTimeBucketForConversation,
} from "./sidebarConversationGroups";
import type { ServerConversation } from "@/types/chat";

function conv(id: string, createdAt?: string): ServerConversation {
  return { id, title: id, created_at: createdAt };
}

describe("sidebarTimeBucketForConversation", () => {
  const now = new Date("2026-05-22T15:00:00+08:00");

  it("classifies today", () => {
    expect(
      sidebarTimeBucketForConversation("2026-05-22T08:00:00+08:00", now),
    ).toBe("today");
  });

  it("classifies yesterday", () => {
    expect(
      sidebarTimeBucketForConversation("2026-05-21T20:00:00+08:00", now),
    ).toBe("yesterday");
  });

  it("classifies last 7 days", () => {
    expect(
      sidebarTimeBucketForConversation("2026-05-18T12:00:00+08:00", now),
    ).toBe("last7");
  });

  it("classifies last 30 days", () => {
    expect(
      sidebarTimeBucketForConversation("2026-05-01T12:00:00+08:00", now),
    ).toBe("last30");
  });

  it("classifies older", () => {
    expect(
      sidebarTimeBucketForConversation("2026-03-01T12:00:00+08:00", now),
    ).toBe("older");
  });

  it("missing date goes to older", () => {
    expect(sidebarTimeBucketForConversation(undefined, now)).toBe("older");
  });
});

describe("buildSidebarConversationSections", () => {
  it("puts pinned first and groups unpinned by time", () => {
    const list = [
      conv("old", "2026-03-01T12:00:00+08:00"),
      conv("today", "2026-05-22T08:00:00+08:00"),
      conv("pinned-old", "2026-01-01T12:00:00+08:00"),
    ];
    const sections = buildSidebarConversationSections(list, ["pinned-old"]);
    expect(sections.map((s) => s.id)).toEqual(["pinned", "today", "older"]);
    expect(sections[0]?.items.map((c) => c.id)).toEqual(["pinned-old"]);
    expect(sections[1]?.items.map((c) => c.id)).toEqual(["today"]);
    expect(sections[2]?.items.map((c) => c.id)).toEqual(["old"]);
  });

  it("returns empty when no conversations", () => {
    expect(buildSidebarConversationSections([], [])).toEqual([]);
  });
});
