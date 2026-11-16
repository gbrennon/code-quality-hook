import { describe, expect, test } from "bun:test";
import { checkSourceCodePath } from "../src/check-source-code-path.ts";

describe("checkSourceCodePath", () => {
  test("accepts supported source and Markdown extensions", () => {
    expect(checkSourceCodePath("src/main.py")).toBe(true);
    expect(checkSourceCodePath("docs/guide.MARKDOWN")).toBe(true);
  });

  test("rejects unsupported paths", () => {
    expect(checkSourceCodePath("image.png")).toBe(false);
    expect(checkSourceCodePath("Makefile")).toBe(false);
  });
});
