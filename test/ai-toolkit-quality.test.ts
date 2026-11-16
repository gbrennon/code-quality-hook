import { describe, expect, test } from "bun:test";
import qualityHook, * as qualityHookEntrypoint from "../src/ai-toolkit-quality.ts";
import { checkSourceCodePath } from "../src/check-source-code-path.ts";

describe("ai-toolkit-quality", () => {
  test("exports the hook registration function", () => {
    expect(typeof qualityHook).toBe("function");
  });

  test("re-exports the source predicate", () => {
    expect(qualityHookEntrypoint.checkSourceCodePath).toBe(checkSourceCodePath);
    expect(qualityHookEntrypoint.checkSourceCodePath("src/main.py")).toBe(true);
  });
});
