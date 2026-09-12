import {
  createShareCardRenderLines,
  createShareCardTitleLines,
  type ShareCardImage,
  type ShareCardRenderLine,
} from "../shared/shareCard";
import { sanitizeStaticOverlayHtml } from "../shared/sanitizeHtml";
import type { Language, TextDirection } from "../shared/types";

const SHARE_OVERLAY_MARKUP = `
  <style>
    *{box-sizing:border-box}.backdrop{position:fixed;inset:0;display:grid;place-items:center;padding:24px;background:rgba(17,14,21,.54);backdrop-filter:blur(4px);font-family:PromptNestCardPersian,PromptNestCardLatin,sans-serif;color:#302b38}
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

export interface ShareOverlayPayload {
  title: string;
  content: string;
  language: Language;
  images?: ShareCardImage[];
}

export interface PreparedShareOverlayPayload {
  titleLines: Array<{ text: string; direction: TextDirection }>;
  bodyLines: ShareCardRenderLine[];
  language: Language;
  images: ShareCardImage[];
  markup: string;
}

export function prepareShareOverlayPayload(payload: ShareOverlayPayload): PreparedShareOverlayPayload {
  return {
    titleLines: createShareCardTitleLines(payload.title, payload.language),
    bodyLines: createShareCardRenderLines(payload.content),
    language: payload.language,
    images: payload.images ?? [],
    markup: sanitizeStaticOverlayHtml(SHARE_OVERLAY_MARKUP),
  };
}

/** Direct-call wrapper used outside scripting serialization, including source-level consumers. */
export async function installShareOverlay(payload: ShareOverlayPayload) {
  return installPreparedShareOverlay(prepareShareOverlayPayload(payload));
}

/** This function is serialized by browser.scripting.executeScript and must remain self-contained. */
export async function installPreparedShareOverlay(payload: PreparedShareOverlayPayload) {
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
  const overlayDocument = new DOMParser().parseFromString(payload.markup, "text/html");
  root.replaceChildren(...overlayDocument.head.childNodes, ...overlayDocument.body.childNodes);
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
  const loadedImages = (await Promise.all(payload.images.map((image) => new Promise<HTMLImageElement | null>((resolve) => {
    const element = new Image();
    element.addEventListener("load", () => resolve(element), { once: true });
    element.addEventListener("error", () => resolve(null), { once: true });
    element.src = image.dataUrl;
  })))).filter((image): image is HTMLImageElement => image !== null);

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

  const drawTitleLines = (
    lines: PreparedShareOverlayPayload["titleLines"],
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number,
  ) => {
    let drawn = 0;
    for (let logicalIndex = 0; logicalIndex < lines.length; logicalIndex += 1) {
      const logicalLine = lines[logicalIndex];
      const wrapped = wrapLine(logicalLine.text, maxWidth);
      for (let visualIndex = 0; visualIndex < wrapped.length; visualIndex += 1) {
        if (drawn >= maxLines) return drawn;
        const hasMore = logicalIndex < lines.length - 1 || visualIndex < wrapped.length - 1;
        const isLastAllowed = drawn === maxLines - 1;
        const line = isLastAllowed && hasMore
          ? `${wrapped[visualIndex].replace(/[.…]+$/u, "")}…`
          : wrapped[visualIndex];
        ctx.direction = logicalLine.direction;
        ctx.textAlign = logicalLine.direction === "rtl" ? "right" : "left";
        ctx.fillText(line, logicalLine.direction === "rtl" ? x + maxWidth : x, y + drawn * lineHeight, maxWidth);
        drawn += 1;
      }
    }
    return drawn;
  };

  type RenderSegment = ShareCardRenderLine["segments"][number];
  type MeasuredSegment = { segment: RenderSegment; width: number };

  const segmentFont = (line: ShareCardRenderLine, segment: RenderSegment, baseSize: number) => {
    const headingScale = line.headingLevel === 1 ? 1.38
      : line.headingLevel === 2 ? 1.26
        : line.headingLevel === 3 ? 1.16
          : line.headingLevel ? 1.08 : 1;
    const size = Math.round(baseSize * headingScale);
    const style = segment.emphasis || segment.math ? "italic" : "normal";
    const weight = line.headingLevel || segment.strong ? 600 : 400;
    const family = segment.code
      ? "PromptNestCardLatin,PromptNestCardPersian,monospace"
      : segment.math ? "serif" : "PromptNestCardPersian,PromptNestCardLatin,sans-serif";
    return { size, value: `${style} ${weight} ${size}px ${family}` };
  };

  const sameStyle = (first: RenderSegment, second: RenderSegment) => (
    first.strong === second.strong
    && first.emphasis === second.emphasis
    && first.code === second.code
    && first.link === second.link
    && first.math === second.math
    && first.marker === second.marker
  );

  const appendSegment = (row: MeasuredSegment[], segment: RenderSegment, width: number) => {
    const previous = row.at(-1);
    if (previous && sameStyle(previous.segment, segment)) {
      previous.segment = { ...previous.segment, text: previous.segment.text + segment.text };
      previous.width += width;
    } else {
      row.push({ segment: { ...segment }, width });
    }
  };

  const wrapStyledLine = (
    line: ShareCardRenderLine,
    maxWidth: number,
    baseSize: number,
  ): MeasuredSegment[][] => {
    if (!line.segments.length) return [[{ segment: { text: "" }, width: 0 }]];
    const isPlain = line.segments.length === 1
      && !line.segments[0].strong
      && !line.segments[0].emphasis
      && !line.segments[0].code
      && !line.segments[0].link
      && !line.segments[0].math
      && !line.segments[0].marker;
    if (isPlain) {
      ctx.font = segmentFont(line, line.segments[0], baseSize).value;
      return wrapLine(line.text, maxWidth).map((text) => [{
        segment: { text },
        width: ctx.measureText(text).width,
      }]);
    }

    const rows: MeasuredSegment[][] = [];
    let row: MeasuredSegment[] = [];
    let rowWidth = 0;
    const finishRow = () => {
      rows.push(row);
      row = [];
      rowWidth = 0;
    };

    for (const segment of line.segments) {
      ctx.font = segmentFont(line, segment, baseSize).value;
      const pieces = segment.text.split(/(\s+)/u).filter(Boolean);
      for (const piece of pieces) {
        const isWhitespace = /^\s+$/u.test(piece);
        const pieceWidth = ctx.measureText(piece).width;
        if (row.length && rowWidth + pieceWidth > maxWidth) finishRow();
        if (isWhitespace && !row.length) continue;
        if (pieceWidth <= maxWidth) {
          appendSegment(row, { ...segment, text: piece }, pieceWidth);
          rowWidth += pieceWidth;
          continue;
        }

        let fragment = "";
        let fragmentWidth = 0;
        for (const character of piece) {
          const characterWidth = ctx.measureText(character).width;
          if (fragment && fragmentWidth + characterWidth > maxWidth) {
            appendSegment(row, { ...segment, text: fragment }, fragmentWidth);
            finishRow();
            fragment = "";
            fragmentWidth = 0;
          }
          fragment += character;
          fragmentWidth += characterWidth;
        }
        if (fragment) {
          appendSegment(row, { ...segment, text: fragment }, fragmentWidth);
          rowWidth += fragmentWidth;
        }
      }
    }
    if (row.length || !rows.length) finishRow();
    return rows;
  };

  const drawBodyLines = (
    lines: ShareCardRenderLine[],
    x: number,
    y: number,
    maxWidth: number,
    baseSize: number,
    bottom: number,
  ) => {
    let baseline = y;
    for (const logicalLine of lines) {
      const defaultSegment = logicalLine.segments[0] ?? { text: "" };
      const lineSize = segmentFont(logicalLine, defaultSegment, baseSize).size;
      const lineHeight = lineSize * 1.65;
      const wrapped = wrapStyledLine(logicalLine, maxWidth, baseSize);
      for (const visualLine of wrapped) {
        if (baseline + lineHeight > bottom) return;
        if (logicalLine.blockquote) {
          ctx.fillStyle = "#8d7ea4";
          ctx.fillRect(logicalLine.direction === "rtl" ? x + maxWidth + 7 : x - 10, baseline - lineSize, 3, lineHeight);
        }
        if (logicalLine.codeBlock) {
          ctx.fillStyle = "#e5e0ea";
          ctx.fillRect(x - 8, baseline - lineSize * 1.05, maxWidth + 16, lineHeight);
        }
        let cursor = logicalLine.direction === "rtl" ? x + maxWidth : x;
        for (const measured of visualLine) {
          const { segment, width } = measured;
          ctx.font = segmentFont(logicalLine, segment, baseSize).value;
          if (segment.code && !logicalLine.codeBlock) {
            ctx.fillStyle = "#e5e0ea";
            ctx.fillRect(
              logicalLine.direction === "rtl" ? cursor - width - 3 : cursor - 3,
              baseline - lineSize * 1.05,
              width + 6,
              lineHeight,
            );
          }
          ctx.fillStyle = segment.link || segment.marker ? "#6952d6"
            : logicalLine.blockquote ? "#6f6679" : "#3a3442";
          ctx.direction = logicalLine.direction;
          ctx.textAlign = logicalLine.direction === "rtl" ? "right" : "left";
          ctx.fillText(segment.text, cursor, baseline);
          cursor += logicalLine.direction === "rtl" ? -width : width;
        }
        baseline += lineHeight;
      }
    }
  };

  const drawShareImages = (images: HTMLImageElement[], x: number, y: number, width: number, height: number) => {
    const visibleImages = images.slice(0, 3);
    if (!visibleImages.length || width <= 0 || height <= 0) return;
    const gap = Math.max(8, Math.round(Math.min(width, height) * 0.035));
    const tileWidth = (width - gap * (visibleImages.length - 1)) / visibleImages.length;
    visibleImages.forEach((image, index) => {
      const tileX = x + index * (tileWidth + gap);
      const radius = Math.max(8, Math.round(Math.min(tileWidth, height) * 0.045));
      roundedRect(tileX, y, tileWidth, height, radius);
      ctx.fillStyle = "#e5e0ea";
      ctx.fill();
      ctx.save();
      ctx.clip();
      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      const scale = Math.min(tileWidth / naturalWidth, height / naturalHeight);
      const drawWidth = naturalWidth * scale;
      const drawHeight = naturalHeight * scale;
      ctx.drawImage(image, tileX + (tileWidth - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
      ctx.restore();
    });
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
    ctx.font = `600 ${titleSize}px PromptNestCardPersian,PromptNestCardLatin,sans-serif`;
    const titleLines = drawTitleLines(payload.titleLines, innerX, titleY, maxWidth, titleSize * 1.45, ratio === "wide" ? 2 : 3);

    const dividerY = titleY + titleLines * titleSize * 1.45 + titleSize * 0.5;
    ctx.fillStyle = "#b7aec3";
    roundedRect(innerX, dividerY, Math.round(short * 0.12), Math.max(4, Math.round(short * 0.005)), 5);
    ctx.fill();

    const bodyY = dividerY + bodySize * 1.8;
    const footerY = height - pad * 1.6;
    let bodyWidth = maxWidth;
    let bodyBottom = footerY - bodySize;
    if (loadedImages.length && ratio === "wide") {
      const imageGap = bodySize * 1.2;
      const imageWidth = maxWidth * 0.34;
      bodyWidth = maxWidth - imageWidth - imageGap;
      drawShareImages(loadedImages, innerX + bodyWidth + imageGap, bodyY - bodySize, imageWidth, bodyBottom - bodyY);
    } else if (loadedImages.length) {
      const imageHeight = Math.min(height * 0.22, short * 0.34);
      const imageY = footerY - bodySize * 1.8 - imageHeight;
      bodyBottom = imageY - bodySize;
      drawShareImages(loadedImages, innerX, imageY, maxWidth, imageHeight);
    }
    drawBodyLines(payload.bodyLines, innerX, bodyY, bodyWidth, bodySize, bodyBottom);

    ctx.direction = isFa ? "rtl" : "ltr";
    ctx.textAlign = isFa ? "right" : "left";
    ctx.fillStyle = "#8a8293";
    ctx.font = `400 ${Math.round(short * 0.02)}px PromptNestCardPersian,PromptNestCardLatin,sans-serif`;
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
