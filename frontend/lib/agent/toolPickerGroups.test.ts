import { describe, expect, it } from "vitest";
import {
  buildToolPickerGroups,
  filterToolPickerGroups,
  fuzzyMatch,
  toolMatchesQuery,
} from "@/lib/agent/toolPickerGroups";
import type { BuiltinToolInfo } from "@/types/tool";

const mk = (partial: Partial<BuiltinToolInfo> & Pick<BuiltinToolInfo, "name">): BuiltinToolInfo => ({
  label: partial.name,
  description: "",
  category: "system",
  source: "builtin",
  args_schema: [],
  used_by_agents: 0,
  ...partial,
});

describe("fuzzyMatch", () => {
  it("matches substring", () => {
    expect(fuzzyMatch("mail", "mcp_xxx_send_mail")).toBe(true);
  });

  it("matches subsequence", () => {
    expect(fuzzyMatch("sndml", "send_mail")).toBe(true);
  });
});

describe("buildToolPickerGroups", () => {
  it("groups builtin by category and mcp by server", () => {
    const tools: BuiltinToolInfo[] = [
      mk({ name: "search_tcm_knowledge", category: "knowledge", label: "知识库检索" }),
      mk({
        name: "mcp_a_send_mail",
        source: "mcp",
        category: "mcp",
        label: "send_mail",
        mcp_server: "qq-mail",
        mcp_remote_name: "send_mail",
      }),
      mk({
        name: "mcp_b_vision",
        source: "mcp",
        category: "mcp",
        label: "vision_analyze",
        mcp_server: "vision-mcp",
        mcp_remote_name: "vision_analyze",
      }),
    ];
    const groups = buildToolPickerGroups(tools);
    expect(groups.some((g) => g.id === "builtin-knowledge")).toBe(true);
    expect(groups.find((g) => g.title === "qq-mail")?.tools).toHaveLength(1);
    expect(groups.find((g) => g.title === "vision-mcp")?.tools).toHaveLength(1);
  });
});

describe("filterToolPickerGroups", () => {
  it("filters by mcp server name and remote tool", () => {
    const tools: BuiltinToolInfo[] = [
      mk({
        name: "mcp_a_send_mail",
        source: "mcp",
        category: "mcp",
        label: "send_mail",
        mcp_server: "qq-mail",
        mcp_remote_name: "send_mail",
      }),
    ];
    const groups = filterToolPickerGroups(buildToolPickerGroups(tools), "qq");
    expect(groups).toHaveLength(1);
    expect(toolMatchesQuery(tools[0], "send")).toBe(true);
  });
});
