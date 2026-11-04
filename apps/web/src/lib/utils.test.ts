import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn utility", () => {
  it("merges class names correctly", () => {
    const result = cn("bg-black", "text-white", { "opacity-50": true, "hidden": false });
    expect(result).toBe("bg-black text-white opacity-50");
  });

  it("handles tailwind class conflicts cleanly", () => {
    const result = cn("p-4", "p-2");
    expect(result).toBe("p-2");
  });
});

