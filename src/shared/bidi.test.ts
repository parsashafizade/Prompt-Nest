import { describe, expect, it } from "vitest";
import { detectLineDirection, splitBidiLines } from "./bidi";

describe("detectLineDirection", () => {
  it("renders Latin-only lines LTR", () => {
    expect(detectLineDirection("Hello, world 123", "rtl")).toBe("ltr");
  });

  it("renders Persian-only lines RTL", () => {
    expect(detectLineDirection("سلام دنیا! ۱۲۳", "ltr")).toBe("rtl");
  });

  it("forces mixed lines RTL even when the first strong character is Latin", () => {
    expect(detectLineDirection("English first و سپس فارسی", "ltr")).toBe("rtl");
  });

  it("ignores digits and punctuation and uses the requested fallback", () => {
    expect(detectLineDirection("1234 — !", "rtl")).toBe("rtl");
    expect(detectLineDirection("1234 — !", "ltr")).toBe("ltr");
  });

  it("classifies every newline-delimited line independently", () => {
    expect(splitBidiLines("Hello\nسلام\nEnglish فارسی\n42", "ltr").map(({ direction }) => direction))
      .toEqual(["ltr", "rtl", "rtl", "ltr"]);
  });
});
