// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installShareOverlay } from "./shareOverlay";

describe("share overlay", () => {
  afterEach(() => {
    document.getElementById("prompt-nest-share-overlay")?.remove();
    vi.restoreAllMocks();
  });

  it("mounts, applies per-line directions, and removes itself when closed", async () => {
    class TestFontFace {
      constructor(_family: string, _source: string) {}
      async load() { return this; }
    }
    Object.defineProperty(globalThis, "FontFace", { configurable: true, value: TestFontFace });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { add: vi.fn() },
    });
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: { runtime: { getURL: (path: string) => `chrome-extension://local/${path}` } },
    });
    const nativeAttachShadow = Element.prototype.attachShadow;
    vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, init) {
      return nativeAttachShadow.call(this, { ...init, mode: "open" });
    });
    const renderedLines: Array<{ text: string; direction: CanvasDirection }> = [];
    const context = {
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillText: (text: string) => renderedLines.push({ text, direction: context.direction }),
      measureText: (value: string) => ({ width: value.length * 8 }),
      direction: "ltr" as CanvasDirection,
      textAlign: "left",
      shadowColor: "transparent",
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillStyle: "#000",
      font: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    await installShareOverlay({
      title: "English first فارسی",
      content: "Hello\nسلام\nEnglish first و فارسی",
      language: "en",
    });

    const host = document.getElementById("prompt-nest-share-overlay")!;
    const canvas = host.shadowRoot!.querySelector("canvas")!;
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1080);
    expect(host.shadowRoot!.querySelectorAll(".ratio")).toHaveLength(3);
    expect(renderedLines).toEqual(expect.arrayContaining([
      { text: "English first فارسی", direction: "rtl" },
      { text: "Hello", direction: "ltr" },
      { text: "سلام", direction: "rtl" },
      { text: "English first و فارسی", direction: "rtl" },
    ]));

    host.shadowRoot!.querySelector<HTMLButtonElement>(".close")!.click();
    expect(document.getElementById("prompt-nest-share-overlay")).toBeNull();
  });
});
