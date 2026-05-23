import { describe, expect, it } from "vitest";
import { injectCitationMarkdownLinks, markdownToPlainText } from "./markdown-utils";

describe("citation markdown preprocessing", () => {
  it("turns registered citation tokens into markdown links", () => {
    expect(injectCitationMarkdownLinks("桂枝汤可调和营卫【K1】【W2】")).toBe(
      "桂枝汤可调和营卫[K1](citation:K1)[W2](citation:W2)",
    );
  });

  it("does not convert unknown token families", () => {
    expect(injectCitationMarkdownLinks("参考【X1】")).toBe("参考【X1】");
  });

  it("omits citation tokens from plain text", () => {
    expect(markdownToPlainText("结论【K1】")).toBe("结论");
  });
});
