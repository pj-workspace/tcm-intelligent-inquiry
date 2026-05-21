import { describe, expect, it } from "vitest";
import {
  normalizeMcpPasteText,
  parseMcpJson,
} from "@/lib/mcp/parseMcpConfig";

const QQ_MAIL_FRAGMENT = `"qq-mail": {
  "command": "docker",
  "args": [
    "compose",
    "-f",
    "/Users/jaypan/Mcp/qq-mail-mcp-server/docker-compose.yml",
    "run",
    "--rm",
    "-i",
    "-T",
    "qq-mail-mcp"
  ]
}`;

describe("normalizeMcpPasteText", () => {
  it("wraps named fragment into valid JSON object", () => {
    const normalized = normalizeMcpPasteText(QQ_MAIL_FRAGMENT);
    expect(() => JSON.parse(normalized)).not.toThrow();
    const obj = JSON.parse(normalized) as Record<string, unknown>;
    expect(obj["qq-mail"]).toBeTruthy();
  });

  it("strips trailing comma on fragment", () => {
    const normalized = normalizeMcpPasteText(`${QQ_MAIL_FRAGMENT},`);
    expect(() => JSON.parse(normalized)).not.toThrow();
  });
});

describe("parseMcpJson", () => {
  it("parses Cursor single-entry fragment with service name", () => {
    const result = parseMcpJson(QQ_MAIL_FRAGMENT);
    expect(result).not.toBeNull();
    expect(result?.name).toBe("qq-mail");
    expect(result?.transport).toBe("stdio");
    expect(result?.command).toBe("docker");
    expect(result?.argsText).toContain("compose");
    expect(result?.argsText).toContain("qq-mail-mcp");
    expect(result?.bulkImport).toBeUndefined();
  });

  it("parses bare command object", () => {
    const result = parseMcpJson(
      JSON.stringify({
        command: "bash",
        args: ["/path/start.sh"],
      })
    );
    expect(result?.transport).toBe("stdio");
    expect(result?.command).toBe("bash");
    expect(result?.name).toBeUndefined();
  });

  it("bulk import when multiple named entries", () => {
    const result = parseMcpJson(
      JSON.stringify({
        "qq-mail": { command: "docker", args: ["run"] },
        "vision-mcp": { command: "bash", args: ["start.sh"] },
      })
    );
    expect(result?.bulkImport).toBeDefined();
    expect(Object.keys(result!.bulkImport!)).toHaveLength(2);
  });
});
