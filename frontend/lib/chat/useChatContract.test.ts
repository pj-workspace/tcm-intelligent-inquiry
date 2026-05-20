import { describe, expect, it } from "vitest";
import { USE_CHAT_OPTS_KEYS, USE_CHAT_RETURN_KEYS } from "./useChatContract";

describe("useChatContract baseline", () => {
  it("opts keys count stable", () => {
    expect(USE_CHAT_OPTS_KEYS).toHaveLength(5);
  });

  it("return keys count stable", () => {
    expect(USE_CHAT_RETURN_KEYS).toHaveLength(60);
  });
});
