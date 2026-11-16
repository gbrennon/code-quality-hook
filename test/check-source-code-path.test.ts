import { describe, expect, test } from "bun:test";
import { checkSourceCodePath } from "../src/check-source-code-path.ts";

describe("checkSourceCodePath", () => {
  test("accepts supported source, Haskell, and Markdown extensions", () => {
    expect(checkSourceCodePath("src/main.py")).toBe(true);
    expect(checkSourceCodePath("src/main.pyw")).toBe(true);
    expect(checkSourceCodePath("docs/guide.MARKDOWN")).toBe(true);
    expect(checkSourceCodePath("src/Main.hs")).toBe(true);
    expect(checkSourceCodePath("src/Main.lhs")).toBe(true);
  });

  test("rejects unsupported paths", () => {
    expect(checkSourceCodePath("image.png")).toBe(false);
    expect(checkSourceCodePath("Makefile")).toBe(false);
  });
});
