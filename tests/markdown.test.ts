import { describe, expect, test } from "bun:test";
import { renderMarkdownLines } from "../src/client/markdown";

const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, "");

describe("renderMarkdownLines", () => {
  test("renders bold and inline code", () => {
    const lines = renderMarkdownLines("**bold** and `code`");
    expect(lines).toHaveLength(1);
    const plain = stripAnsi(lines[0] ?? "");
    expect(plain).toContain("bold");
    expect(plain).toContain("code");
  });

  test("handles unordered list", () => {
    const lines = renderMarkdownLines("- item one\n- item two");
    expect(lines).toHaveLength(2);
    expect(stripAnsi(lines[0] ?? "").startsWith("*")).toBe(true);
  });

  test("marks code fences", () => {
    const lines = renderMarkdownLines("```ts\nconst x = 1;\n```");
    expect(lines[0]).toBeDefined();
    expect(stripAnsi(lines[0] ?? "")).toContain("code");
    expect(stripAnsi(lines[1] ?? "")).toContain("const x");
  });
});
