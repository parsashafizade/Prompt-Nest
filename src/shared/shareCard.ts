import { detectLineDirection } from "./bidi";
import {
  createMarkdownPreviewBlocks,
  createMarkdownPreviewModel,
} from "./markdownPreview";
import type { Language, TextDirection } from "./types";

export type ShareCardRatio = "story" | "square" | "wide";

export interface ShareCardContent {
  title: string;
  content: string;
  language: Language;
}

export interface ShareCardRenderLine {
  text: string;
  direction: TextDirection;
  headingLevel?: number;
  blockquote?: boolean;
  strong?: boolean;
  emphasis?: boolean;
  code?: boolean;
  link?: boolean;
  math?: boolean;
}

const CARD_SIZES: Record<ShareCardRatio, [number, number]> = {
  story: [720, 1280],
  square: [1080, 1080],
  wide: [1200, 675],
};

export function createShareCardTitleLines(title: string, language: Language) {
  const fallbackDirection = language === "fa" ? "rtl" : "ltr";
  return title.split("\n").map((text) => ({
    text,
    direction: detectLineDirection(text, fallbackDirection),
  }));
}

export function createShareCardRenderLines(content: string): ShareCardRenderLine[] {
  return createMarkdownPreviewBlocks(createMarkdownPreviewModel(content)).flatMap((block) => {
    if (block.kind === "code") {
      return block.lines.map(({ text, direction }) => ({ text, direction, code: true }));
    }
    if (block.kind === "math") {
      return [{
        text: block.expression,
        direction: "ltr" as const,
        math: true,
      }];
    }
    return [{
      text: block.segments.map((segment) => (
        segment.kind === "text" ? segment.text : segment.expression
      )).join(""),
      direction: block.direction,
      headingLevel: block.headingLevel,
      blockquote: block.blockquote,
      strong: block.segments.some((segment) => segment.kind === "text" && segment.strong),
      emphasis: block.segments.some((segment) => segment.kind === "text" && segment.emphasis),
      code: block.segments.some((segment) => segment.kind === "text" && segment.code),
      link: block.segments.some((segment) => segment.kind === "text" && segment.link),
      math: block.segments.some((segment) => segment.kind === "math"),
    }];
  });
}

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

function drawTitleLines(
  context: CanvasRenderingContext2D,
  lines: ReturnType<typeof createShareCardTitleLines>,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  let drawn = 0;
  for (let logicalIndex = 0; logicalIndex < lines.length; logicalIndex += 1) {
    const logicalLine = lines[logicalIndex];
    const wrapped = wrapLine(context, logicalLine.text, maxWidth);
    for (let visualIndex = 0; visualIndex < wrapped.length; visualIndex += 1) {
      if (drawn >= maxLines) return drawn;
      const hasMore = logicalIndex < lines.length - 1 || visualIndex < wrapped.length - 1;
      const isLastAllowed = drawn === maxLines - 1;
      const line = isLastAllowed && hasMore
        ? `${wrapped[visualIndex].replace(/[.…]+$/u, "")}…`
        : wrapped[visualIndex];
      context.direction = logicalLine.direction;
      context.textAlign = logicalLine.direction === "rtl" ? "right" : "left";
      context.fillText(
        line,
        logicalLine.direction === "rtl" ? x + maxWidth : x,
        y + drawn * lineHeight,
        maxWidth,
      );
      drawn += 1;
    }
  }
  return drawn;
}

function lineFont(line: ShareCardRenderLine, baseSize: number) {
  const headingScale = line.headingLevel === 1 ? 1.38
    : line.headingLevel === 2 ? 1.26
      : line.headingLevel === 3 ? 1.16
        : line.headingLevel ? 1.08 : 1;
  const size = Math.round(baseSize * headingScale);
  const style = line.emphasis || line.math ? "italic" : "normal";
  const weight = line.headingLevel || line.strong ? 600 : 400;
  const family = line.code
    ? "PromptNestLatin, PromptNestPersian, monospace"
    : line.math
      ? "serif"
      : "PromptNestPersian, PromptNestLatin, sans-serif";
  return { size, value: `${style} ${weight} ${size}px ${family}` };
}

function drawBodyLines(
  context: CanvasRenderingContext2D,
  lines: ShareCardRenderLine[],
  x: number,
  y: number,
  maxWidth: number,
  baseSize: number,
  bottom: number,
) {
  let baseline = y;
  for (let logicalIndex = 0; logicalIndex < lines.length; logicalIndex += 1) {
    const logicalLine = lines[logicalIndex];
    const font = lineFont(logicalLine, baseSize);
    const lineHeight = font.size * 1.65;
    context.font = font.value;
    const wrapped = wrapLine(context, logicalLine.text, maxWidth);

    for (let visualIndex = 0; visualIndex < wrapped.length; visualIndex += 1) {
      if (baseline + lineHeight > bottom) {
        const previous = Math.max(y, baseline - lineHeight);
        context.font = lineFont(logicalLine, baseSize).value;
        context.direction = logicalLine.direction;
        context.textAlign = logicalLine.direction === "rtl" ? "right" : "left";
        context.fillText("…", logicalLine.direction === "rtl" ? x + maxWidth : x, previous, maxWidth);
        return;
      }

      const visualLine = wrapped[visualIndex];
      if (logicalLine.code) {
        context.fillStyle = "#e5e0ea";
        context.fillRect(x - 8, baseline - font.size * 1.05, maxWidth + 16, lineHeight);
      }
      if (logicalLine.blockquote) {
        context.fillStyle = "#8d7ea4";
        context.fillRect(
          logicalLine.direction === "rtl" ? x + maxWidth + 7 : x - 10,
          baseline - font.size,
          3,
          lineHeight,
        );
      }

      context.fillStyle = logicalLine.link ? "#6952d6"
        : logicalLine.blockquote ? "#6f6679"
          : "#3a3442";
      context.direction = logicalLine.direction;
      context.textAlign = logicalLine.direction === "rtl" ? "right" : "left";
      context.fillText(
        visualLine,
        logicalLine.direction === "rtl" ? x + maxWidth : x,
        baseline,
        maxWidth,
      );
      baseline += lineHeight;
    }
  }
}

export function renderShareCard(
  canvas: HTMLCanvasElement,
  payload: ShareCardContent,
  ratio: ShareCardRatio,
) {
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
  const titleLines = drawTitleLines(
    context,
    createShareCardTitleLines(payload.title, payload.language),
    innerX,
    titleY,
    maxWidth,
    titleSize * 1.45,
    ratio === "wide" ? 2 : 3,
  );

  const dividerY = titleY + titleLines * titleSize * 1.45 + titleSize * 0.5;
  context.beginPath();
  context.roundRect(innerX, dividerY, Math.round(short * 0.12), Math.max(4, Math.round(short * 0.005)), 5);
  context.fillStyle = "#b7aec3";
  context.fill();

  const bodyY = dividerY + bodySize * 1.8;
  const footerY = height - pad * 1.6;
  drawBodyLines(
    context,
    createShareCardRenderLines(payload.content),
    innerX,
    bodyY,
    maxWidth,
    bodySize,
    footerY - bodySize,
  );

  context.direction = fallbackDirection;
  context.textAlign = fallbackDirection === "rtl" ? "right" : "left";
  context.fillStyle = "#8a8293";
  context.font = `400 ${Math.round(short * 0.02)}px PromptNestPersian, PromptNestLatin, sans-serif`;
  context.fillText("Prompt Nest", fallbackDirection === "rtl" ? width - innerX : innerX, footerY);
}
