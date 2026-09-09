import { detectLineDirection } from "./bidi";
import type { Language } from "./types";

export type ShareCardRatio = "story" | "square" | "wide";

export interface ShareCardContent {
  title: string;
  content: string;
  language: Language;
}

const CARD_SIZES: Record<ShareCardRatio, [number, number]> = {
  story: [720, 1280],
  square: [1080, 1080],
  wide: [1200, 675],
};

function wrapLine(context: CanvasRenderingContext2D, line: string, maxWidth: number) {
  if (!line) return [""];
  const result: string[] = [];
  let remaining = line;
  while (context.measureText(remaining).width > maxWidth) {
    const characters = [...remaining];
    let cutAt = 1;
    let lastWhitespace = -1;
    for (let index = 1; index <= characters.length; index += 1) {
      if (/\s/u.test(characters[index - 1])) lastWhitespace = index;
      if (context.measureText(characters.slice(0, index).join("")).width > maxWidth) {
        cutAt = lastWhitespace > 0 ? lastWhitespace : Math.max(1, index - 1);
        break;
      }
    }
    result.push(characters.slice(0, cutAt).join("").trimEnd());
    remaining = characters.slice(cutAt).join("").trimStart();
  }
  result.push(remaining);
  return result;
}

function drawLogicalLines(
  context: CanvasRenderingContext2D,
  text: string,
  fallbackDirection: "ltr" | "rtl",
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  let drawn = 0;
  const logicalLines = text.split("\n");
  for (let logicalIndex = 0; logicalIndex < logicalLines.length; logicalIndex += 1) {
    const logicalLine = logicalLines[logicalIndex];
    const direction = detectLineDirection(logicalLine, fallbackDirection);
    const wrapped = wrapLine(context, logicalLine, maxWidth);
    for (let visualIndex = 0; visualIndex < wrapped.length; visualIndex += 1) {
      if (drawn >= maxLines) return drawn;
      const hasMore = logicalIndex < logicalLines.length - 1 || visualIndex < wrapped.length - 1;
      const isLastAllowed = drawn === maxLines - 1;
      const line = isLastAllowed && hasMore
        ? `${wrapped[visualIndex].replace(/[.…]+$/u, "")}…`
        : wrapped[visualIndex];
      context.direction = direction;
      context.textAlign = direction === "rtl" ? "right" : "left";
      context.fillText(line, direction === "rtl" ? x + maxWidth : x, y + drawn * lineHeight, maxWidth);
      drawn += 1;
    }
  }
  return drawn;
}

export function renderShareCard(canvas: HTMLCanvasElement, payload: ShareCardContent, ratio: ShareCardRatio) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const [width, height] = CARD_SIZES[ratio];
  canvas.width = width;
  canvas.height = height;
  const short = Math.min(width, height);
  const pad = Math.round(short * 0.085);
  const fallbackDirection = payload.language === "fa" ? "rtl" : "ltr";

  context.direction = "ltr";
  context.textAlign = "left";
  context.shadowColor = "transparent";
  context.fillStyle = "#e9e6ef";
  context.fillRect(0, 0, width, height);

  context.beginPath();
  context.roundRect(pad, pad, width - pad * 2, height - pad * 2, Math.round(short * 0.04));
  context.fillStyle = "#efecf3";
  context.shadowColor = "rgba(255,255,255,.9)";
  context.shadowBlur = 12;
  context.shadowOffsetX = -6;
  context.shadowOffsetY = -6;
  context.fill();
  context.shadowColor = "rgba(159,151,171,.45)";
  context.shadowOffsetX = 6;
  context.shadowOffsetY = 6;
  context.fill();
  context.shadowColor = "transparent";

  const innerX = pad * 1.62;
  const maxWidth = width - innerX * 2;
  const titleSize = Math.round(short * (ratio === "wide" ? 0.052 : 0.057));
  const bodySize = Math.round(short * (ratio === "story" ? 0.038 : 0.032));
  const titleY = pad * 1.85;
  context.fillStyle = "#6d607f";
  context.font = `600 ${titleSize}px PromptNestPersian, PromptNestLatin, sans-serif`;
  const titleLines = drawLogicalLines(context, payload.title, fallbackDirection, innerX, titleY, maxWidth, titleSize * 1.45, ratio === "wide" ? 2 : 3);

  const dividerY = titleY + titleLines * titleSize * 1.45 + titleSize * 0.5;
  context.beginPath();
  context.roundRect(innerX, dividerY, Math.round(short * 0.12), Math.max(4, Math.round(short * 0.005)), 5);
  context.fillStyle = "#b7aec3";
  context.fill();

  const bodyY = dividerY + bodySize * 1.8;
  const footerY = height - pad * 1.6;
  const lineHeight = bodySize * 1.65;
  const maxLines = Math.max(2, Math.floor((footerY - bodyY - bodySize) / lineHeight));
  context.fillStyle = "#3a3442";
  context.font = `400 ${bodySize}px PromptNestPersian, PromptNestLatin, sans-serif`;
  drawLogicalLines(context, payload.content, fallbackDirection, innerX, bodyY, maxWidth, lineHeight, maxLines);

  context.direction = fallbackDirection;
  context.textAlign = fallbackDirection === "rtl" ? "right" : "left";
  context.fillStyle = "#8a8293";
  context.font = `400 ${Math.round(short * 0.02)}px PromptNestPersian, PromptNestLatin, sans-serif`;
  context.fillText("Prompt Nest", fallbackDirection === "rtl" ? width - innerX : innerX, footerY);
}
