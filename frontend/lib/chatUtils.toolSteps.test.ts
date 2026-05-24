/** chatUtils：工具步骤收口与 trace 匹配。 */

import { describe, expect, it } from "vitest";
import type { BrainstormStep } from "@/types/brainstorm";
import {
  finalizeRunningAskUserTools,
  findRunningToolStepIndex,
  supersedeRunningToolSteps,
} from "@/lib/chatUtils";

const runningTool = (runId: string, name: string): BrainstormStep => ({
  id: `tool-${runId}`,
  type: "tool",
  toolName: name,
  status: "running",
  runId,
});

describe("finalizeRunningAskUserTools", () => {
  it("marks running ask_user_form as success", () => {
    const out = finalizeRunningAskUserTools([
      runningTool("r1", "ask_user_form"),
    ]);
    expect(out[0].type).toBe("tool");
    if (out[0].type !== "tool") return;
    expect(out[0].status).toBe("success");
  });
});

describe("supersedeRunningToolSteps", () => {
  it("marks previous running same tool as error before retry", () => {
    const steps: BrainstormStep[] = [runningTool("r1", "mcp_x_jxnu_auth_logout")];
    const out = supersedeRunningToolSteps(steps, "mcp_x_jxnu_auth_logout");
    if (out[0].type !== "tool") throw new Error("tool");
    expect(out[0].status).toBe("error");
  });
});

describe("findRunningToolStepIndex", () => {
  it("prefers runId match over generic running", () => {
    const steps: BrainstormStep[] = [
      runningTool("r1", "tool_a"),
      runningTool("r2", "tool_b"),
    ];
    expect(findRunningToolStepIndex(steps, "r2", "tool_b")).toBe(1);
  });
});
