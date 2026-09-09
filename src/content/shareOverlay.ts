import type { Language } from "../shared/types";

export interface ShareOverlayPayload {
  title: string;
  content: string;
  language: Language;
}

/** This function is serialized by browser.scripting.executeScript and must remain self-contained. */
export async function installShareOverlay(payload: ShareOverlayPayload) {
  const OVERLAY_ID = "prompt-nest-share-overlay";
  document.getElementById(OVERLAY_ID)?.remove();

  type RatioKey = "story" | "square" | "wide";
  const isFa = payload.language === "fa";
  const labels = isFa
    ? {
        title: "کارت اشتراک‌گذاری",
        story: "استوری ۹:۱۶",
        square: "پست ۱:۱",
        wide: "لینکدین / ایکس ۱۶:۹",
        download: "دانلود PNG",
        copy: "کپی تصویر",
        copied: "کپی شد",
        failed: "کپی تصویر ممکن نبود",
        close: "بستن",
      }
    : {
        title: "Share card",
        story: "Story 9:16",
        square: "Post 1:1",
        wide: "LinkedIn / X 16:9",
        download: "Download PNG",
        copy: "Copy image",
        copied: "Copied",
        failed: "Could not copy image",
        close: "Close",
      };

  const host = document.createElement("div");
  host.id = OVERLAY_ID;
  host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:auto";
  document.documentElement.appendChild(host);
  const shadow = host.attachShadow({ mode: "closed" });
  const root = document.createElement("div");
  root.dir = isFa ? "rtl" : "ltr";
  root.innerHTML = `
    <style>
      *{box-sizing:border-box} .backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:rgba(17,14,21,.54);backdrop-filter:blur(4px);font-family:PromptNestCardPersian,PromptNestCardLatin,sans-serif;color:#302b38}
      .panel{width:min(860px,96vw);max-height:92vh;display:grid;grid-template-columns:minmax(260px,1fr) 252px;gap:24px;padding:24px;border:1px solid rgba(117,103,143,.16);border-radius:12px;background:#eeebf2;box-shadow:8px 8px 12px rgba(13,10,17,.34),-8px -8px 12px rgba(255,255,255,.14)}
      .preview{min-width:0;min-height:332px;display:grid;place-items:center;padding:16px;border-radius:12px;box-shadow:inset 5px 5px 12px #d2ced9,inset -5px -5px 12px #fff;overflow:auto}
      canvas{display:block;max-width:100%;max-height:72vh;border-radius:12px;box-shadow:6px 6px 10px #c9c5d1,-6px -6px 10px #fff;background:#e8e4ed}
      .controls{display:flex;flex-direction:column;gap:12px}.head{display:flex;align-items:center;gap:8px;margin-bottom:4px}.head h2{flex:1;margin:0;font-size:18px}.icon{width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:10px;background:#eeebf2;color:#302b38;box-shadow:4px 4px 9px #d2ced9,-4px -4px 9px #fff;cursor:pointer;font-size:20px;transition:transform 150ms cubic-bezier(.4,0,.2,1)}.icon:hover{transform:translateY(-1px) scale(1.04)}.icon:active{transform:scale(.94);transition-duration:80ms}.ratios{display:grid;gap:8px;padding:4px;border-radius:12px;box-shadow:inset 3px 3px 7px #d2ced9,inset -3px -3px 7px #fff}.ratio,.action{min-height:40px;padding:8px 16px;border:0;border-radius:10px;background:transparent;color:#5d5666;font:600 13px PromptNestCardPersian,PromptNestCardLatin,sans-serif;cursor:pointer;transition:transform 150ms cubic-bezier(.4,0,.2,1),opacity 150ms cubic-bezier(.4,0,.2,1)}.ratio:hover,.action:hover{transform:translateY(-1px)}.ratio:active,.action:active{transform:scale(.96);transition-duration:80ms}.ratio[aria-pressed=true]{color:#302b38;background:#f4f1f7;box-shadow:3px 3px 7px #d2ced9,-3px -3px 7px #fff}.action{background:#eeebf2;color:#302b38;box-shadow:4px 4px 9px #d2ced9,-4px -4px 9px #fff}.action.primary,.action.primary:hover,.action.primary:active{margin-top:8px;color:#fff;background:#625377}.status{min-height:20px;color:#269264;font:12px PromptNestCardPersian,PromptNestCardLatin,sans-serif;text-align:center}.credit{margin-top:auto;color:#81788a;font:11px PromptNestCardPersian,PromptNestCardLatin,sans-serif;text-align:center}
      @media(max-width:650px){.panel{max-height:94vh;grid-template-columns:1fr;gap:12px;overflow:auto}.preview{min-height:252px}.controls{min-height:260px}canvas{max-height:52vh}}
    </style>
    <div class="backdrop" role="dialog" aria-modal="true">
      <div class="panel">
        <div class="preview"><canvas></canvas></div>
        <div class="controls">
          <div class="head"><h2></h2><button class="icon close">×</button></div>
          <div class="ratios" role="group">
            <button class="ratio" data-ratio="story" aria-pressed="false"></button>
            <button class="ratio" data-ratio="square" aria-pressed="true"></button>
            <button class="ratio" data-ratio="wide" aria-pressed="false"></button>
          </div>
          <button class="action primary download"></button>
          <button class="action copy"></button>
          <div class="status" aria-live="polite"></div>
          <div class="credit">Prompt Nest · Local only</div>
        </div>
      </div>
    </div>`;
  shadow.appendChild(root);
  root.querySelector<HTMLElement>(".backdrop")!.setAttribute("aria-label", labels.title);
  root.querySelector<HTMLElement>(".head h2")!.textContent = labels.title;
  root.querySelector<HTMLElement>(".close")!.setAttribute("aria-label", labels.close);
  root.querySelector<HTMLElement>(".ratios")!.setAttribute("aria-label", labels.title);
  root.querySelector<HTMLElement>("[data-ratio=story]")!.textContent = labels.story;
  root.querySelector<HTMLElement>("[data-ratio=square]")!.textContent = labels.square;
  root.querySelector<HTMLElement>("[data-ratio=wide]")!.textContent = labels.wide;
  root.querySelector<HTMLElement>(".download")!.textContent = labels.download;
  root.querySelector<HTMLElement>(".copy")!.textContent = labels.copy;

  const extensionApi = (globalThis as unknown as {
    browser?: { runtime?: { getURL: (path: string) => string } };
    chrome?: { runtime?: { getURL: (path: string) => string } };
  }).browser ?? (globalThis as unknown as {
    chrome?: { runtime?: { getURL: (path: string) => string } };
  }).chrome;
  const persianFontUrl = extensionApi?.runtime?.getURL("fonts/Vazirmatn-Regular.woff2");
  const latinFontUrl = extensionApi?.runtime?.getURL("fonts/Inter-Regular.woff2");
  if (persianFontUrl && latinFontUrl) {
    try {
      const [persianFace, latinFace] = await Promise.all([
        new FontFace("PromptNestCardPersian", `url("${persianFontUrl}")`).load(),
        new FontFace("PromptNestCardLatin", `url("${latinFontUrl}")`).load(),
      ]);
      document.fonts.add(persianFace);
      document.fonts.add(latinFace);
    } catch {
      // The canvas has a local system-font fallback if a host blocks extension font loading.
    }
  }

  const canvas = root.querySelector("canvas")!;
  const ctx = canvas.getContext("2d")!;
  const status = root.querySelector<HTMLElement>(".status")!;
  const sizes: Record<RatioKey, [number, number]> = {
    story: [720, 1280],
    square: [1080, 1080],
    wide: [1200, 675],
  };
  let ratio: RatioKey = "square";

  const detectDirection = (line: string): CanvasDirection => {
    const hasArabic = /[\u0600-\u06ff\u0750-\u077f\u0870-\u089f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(line);
    const hasLatin = /[A-Za-z\u00c0-\u024f\u1e00-\u1eff]/u.test(line);
    if (hasArabic) return "rtl";
    if (hasLatin) return "ltr";
    return isFa ? "rtl" : "ltr";
  };

  const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  };

  const wrapLine = (line: string, maxWidth: number) => {
    if (!line) return [""];
    const result: string[] = [];
    let remaining = line;
    while (ctx.measureText(remaining).width > maxWidth) {
      const characters = [...remaining];
      let cutAt = 1;
      let lastWhitespace = -1;
      for (let index = 1; index <= characters.length; index += 1) {
        if (/\s/u.test(characters[index - 1])) lastWhitespace = index;
        if (ctx.measureText(characters.slice(0, index).join("")).width > maxWidth) {
          cutAt = lastWhitespace > 0 ? lastWhitespace : Math.max(1, index - 1);
          break;
        }
      }
      result.push(characters.slice(0, cutAt).join("").trimEnd());
      remaining = characters.slice(cutAt).join("").trimStart();
    }
    result.push(remaining);
    return result;
  };

  const drawLogicalLines = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
  ) => {
    let drawn = 0;
    const logicalLines = text.split("\n");
    for (let logicalIndex = 0; logicalIndex < logicalLines.length; logicalIndex += 1) {
      const logicalLine = logicalLines[logicalIndex];
      const direction = detectDirection(logicalLine);
      const wrapped = wrapLine(logicalLine, maxWidth);
      for (let visualIndex = 0; visualIndex < wrapped.length; visualIndex += 1) {
        const visualLine = wrapped[visualIndex];
        if (drawn >= maxLines) return drawn;
        const isLastAllowed = drawn === maxLines - 1;
        const hasMore = logicalIndex < logicalLines.length - 1 || visualIndex < wrapped.length - 1;
        let output = visualLine;
        if (isLastAllowed && hasMore) output = `${visualLine.replace(/[.…]+$/u, "")}…`;
        ctx.direction = direction;
        ctx.textAlign = direction === "rtl" ? "right" : "left";
        ctx.fillText(output, direction === "rtl" ? x + maxWidth : x, y + drawn * lineHeight, maxWidth);
        drawn += 1;
      }
    }
    return drawn;
  };

  const render = () => {
    const [width, height] = sizes[ratio];
    canvas.width = width;
    canvas.height = height;
    const short = Math.min(width, height);
    const pad = Math.round(short * 0.085);

    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#e9e6ef";
    ctx.fillRect(0, 0, width, height);

    ctx.shadowColor = "rgba(255,255,255,.9)";
    ctx.shadowBlur = Math.min(12, Math.round(short * 0.03));
    ctx.shadowOffsetX = -Math.round(short * 0.014);
    ctx.shadowOffsetY = -Math.round(short * 0.014);
    roundedRect(pad, pad, width - pad * 2, height - pad * 2, Math.round(short * 0.04));
    ctx.fillStyle = "#efecf3";
    ctx.fill();

    ctx.shadowColor = "rgba(159,151,171,.45)";
    ctx.shadowOffsetX = Math.round(short * 0.014);
    ctx.shadowOffsetY = Math.round(short * 0.014);
    ctx.fill();
    ctx.shadowColor = "transparent";

    const innerX = pad * 1.62;
    const maxWidth = width - innerX * 2;
    const titleSize = Math.round(short * (ratio === "wide" ? 0.052 : 0.057));
    const bodySize = Math.round(short * (ratio === "story" ? 0.038 : 0.032));
    const titleY = pad * 1.85;
    ctx.fillStyle = "#6d607f";
    ctx.font = `600 ${titleSize}px PromptNestCardPersian, PromptNestCardLatin, sans-serif`;
    const titleLines = drawLogicalLines(payload.title, innerX, titleY, maxWidth, titleSize * 1.45, ratio === "wide" ? 2 : 3);

    const dividerY = titleY + titleLines * titleSize * 1.45 + titleSize * 0.5;
    ctx.fillStyle = "#b7aec3";
    roundedRect(innerX, dividerY, Math.round(short * 0.12), Math.max(4, Math.round(short * 0.005)), 5);
    ctx.fill();

    const bodyY = dividerY + bodySize * 1.8;
    const footerY = height - pad * 1.6;
    const availableHeight = footerY - bodyY - bodySize;
    const lineHeight = bodySize * 1.65;
    const maxLines = Math.max(2, Math.floor(availableHeight / lineHeight));
    ctx.fillStyle = "#3a3442";
    ctx.font = `400 ${bodySize}px PromptNestCardPersian, PromptNestCardLatin, sans-serif`;
    drawLogicalLines(payload.content, innerX, bodyY, maxWidth, lineHeight, maxLines);

    ctx.direction = isFa ? "rtl" : "ltr";
    ctx.textAlign = isFa ? "right" : "left";
    ctx.fillStyle = "#8a8293";
    ctx.font = `400 ${Math.round(short * 0.02)}px PromptNestCardPersian, PromptNestCardLatin, sans-serif`;
    ctx.fillText("Prompt Nest", isFa ? width - innerX : innerX, footerY);
  };

  const setStatus = (message: string, failed = false) => {
    status.textContent = message;
    status.style.color = failed ? "#b55364" : "#269264";
    globalThis.setTimeout(() => { status.textContent = ""; }, 2200);
  };

  const asBlob = () => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

  root.querySelectorAll<HTMLButtonElement>(".ratio").forEach((button) => {
    button.addEventListener("click", () => {
      ratio = button.dataset.ratio as RatioKey;
      root.querySelectorAll(".ratio").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      render();
    });
  });
  root.querySelector(".close")!.addEventListener("click", () => host.remove());
  root.querySelector(".backdrop")!.addEventListener("click", (event) => {
    if (event.target === root.querySelector(".backdrop")) host.remove();
  });
  root.querySelector(".download")!.addEventListener("click", async () => {
    const blob = await asBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prompt-card-${ratio}.png`;
    link.click();
    URL.revokeObjectURL(url);
  });
  root.querySelector(".copy")!.addEventListener("click", async () => {
    try {
      const blob = await asBlob();
      if (!blob) throw new Error("No image");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus(labels.copied);
    } catch {
      setStatus(labels.failed, true);
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") host.remove();
    if (event.key === "Tab") {
      const focusable = [...root.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && shadow.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && shadow.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  render();
  (root.querySelector(".close") as HTMLButtonElement).focus();
}
