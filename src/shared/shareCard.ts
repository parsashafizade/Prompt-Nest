import { detectLineDirection } from "./bidi";
import {
  createMarkdownPreviewBlocks,
  createMarkdownPreviewModel,
  renderMathToPlainText,
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
  codeBlock?: boolean;
  segments: ShareCardRenderSegment[];
}

export interface ShareCardRenderSegment {
  text: string;
  strong?: boolean;
  emphasis?: boolean;
  code?: boolean;
  link?: boolean;
  math?: boolean;
  marker?: boolean;
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
      return block.lines.map(({ text, direction }) => ({
        text,
        direction,
        codeBlock: true,
        segments: [{ text, code: true }],
      }));
    }
    if (block.kind === "math") {
      const text = renderMathToPlainText(block.expression);
      return [{
        text,
        direction: "ltr" as const,
        segments: [{ text, math: true }],
      }];
    }
    const segments: ShareCardRenderSegment[] = block.segments.map((segment) => (
      segment.kind === "math"
        ? { text: renderMathToPlainText(segment.expression), math: true }
        : {
            text: segment.text,
            strong: segment.strong,
            emphasis: segment.emphasis,
            code: segment.code,
            link: segment.link,
            marker: segment.marker,
          }
    ));
    return [{
      text: segments.map((segment) => segment.text).join(""),
      direction: block.direction,
      headingLevel: block.headingLevel,
      blockquote: block.blockquote,
      segments,
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

function segmentFont(
  line: ShareCardRenderLine,
  segment: ShareCardRenderSegment,
  baseSize: number,
) {
  const headingScale = line.headingLevel === 1 ? 1.38
    : line.headingLevel === 2 ? 1.26
      : line.headingLevel === 3 ? 1.16
        : line.headingLevel ? 1.08 : 1;
  const size = Math.round(baseSize * headingScale);
  const style = segment.emphasis || segment.math ? "italic" : "normal";
  const weight = line.headingLevel || segment.strong ? 600 : 400;
  const family = segment.code
    ? "PromptNestLatin, PromptNestPersian, monospace"
    : segment.math
      ? "serif"
      : "PromptNestPersian, PromptNestLatin, sans-serif";
  return { size, value: `${style} ${weight} ${size}px ${family}` };
}

interface MeasuredShareSegment {
  segment: ShareCardRenderSegment;
  width: number;
}

function sameShareStyle(first: ShareCardRenderSegment, second: ShareCardRenderSegment) {
  return first.strong === second.strong
    && first.emphasis === second.emphasis
    && first.code === second.code
    && first.link === second.link
    && first.math === second.math
    && first.marker === second.marker;
}

function appendMeasuredSegment(
  row: MeasuredShareSegment[],
  segment: ShareCardRenderSegment,
  width: number,
) {
  const previous = row.at(-1);
  if (previous && sameShareStyle(previous.segment, segment)) {
    previous.segment = { ...previous.segment, text: previous.segment.text + segment.text };
    previous.width += width;
  } else {
    row.push({ segment: { ...segment }, width });
  }
}

function wrapStyledLine(
  context: CanvasRenderingContext2D,
  line: ShareCardRenderLine,
  maxWidth: number,
  baseSize: number,
): MeasuredShareSegment[][] {
  if (!line.segments.length) return [[{ segment: { text: "" }, width: 0 }]];
  const isPlain = line.segments.length === 1
    && !line.segments[0].strong
    && !line.segments[0].emphasis
    && !line.segments[0].code
    && !line.segments[0].link
    && !line.segments[0].math
    && !line.segments[0].marker;
  if (isPlain) {
    context.font = segmentFont(line, line.segments[0], baseSize).value;
    return wrapLine(context, line.text, maxWidth).map((text) => [{
      segment: { text },
      width: context.measureText(text).width,
    }]);
  }

  const rows: MeasuredShareSegment[][] = [];
  let row: MeasuredShareSegment[] = [];
  let rowWidth = 0;
  const finishRow = () => {
    rows.push(row);
    row = [];
    rowWidth = 0;
  };

  for (const segment of line.segments) {
    context.font = segmentFont(line, segment, baseSize).value;
    const pieces = segment.text.split(/(\s+)/u).filter(Boolean);
    for (const piece of pieces) {
      const isWhitespace = /^\s+$/u.test(piece);
      const pieceWidth = context.measureText(piece).width;
      if (row.length && rowWidth + pieceWidth > maxWidth) finishRow();
      if (isWhitespace && !row.length) continue;

      if (pieceWidth <= maxWidth) {
        appendMeasuredSegment(row, { ...segment, text: piece }, pieceWidth);
        rowWidth += pieceWidth;
        continue;
      }

      let fragment = "";
      let fragmentWidth = 0;
      for (const character of piece) {
        const characterWidth = context.measureText(character).width;
        if (fragment && fragmentWidth + characterWidth > maxWidth) {
          appendMeasuredSegment(row, { ...segment, text: fragment }, fragmentWidth);
          finishRow();
          fragment = "";
          fragmentWidth = 0;
        }
        fragment += character;
        fragmentWidth += characterWidth;
      }
      if (fragment) {
        appendMeasuredSegment(row, { ...segment, text: fragment }, fragmentWidth);
        rowWidth += fragmentWidth;
      }
    }
  }
  if (row.length || !rows.length) finishRow();
  return rows;
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
  for (const logicalLine of lines) {
    const defaultSegment = logicalLine.segments[0] ?? { text: "" };
    const lineSize = segmentFont(logicalLine, defaultSegment, baseSize).size;
    const lineHeight = lineSize * 1.65;
    const wrapped = wrapStyledLine(context, logicalLine, maxWidth, baseSize);

    for (const visualLine of wrapped) {
      if (baseline + lineHeight > bottom) {
        const previous = Math.max(y, baseline - lineHeight);
        context.font = segmentFont(logicalLine, defaultSegment, baseSize).value;
        context.direction = logicalLine.direction;
        context.textAlign = logicalLine.direction === "rtl" ? "right" : "left";
        context.fillText("…", logicalLine.direction === "rtl" ? x + maxWidth : x, previous, maxWidth);
        return;
      }

      if (logicalLine.blockquote) {
        context.fillStyle = "#8d7ea4";
        context.fillRect(
          logicalLine.direction === "rtl" ? x + maxWidth + 7 : x - 10,
          baseline - lineSize,
          3,
          lineHeight,
        );
      }

      if (logicalLine.codeBlock) {
        context.fillStyle = "#e5e0ea";
        context.fillRect(x - 8, baseline - lineSize * 1.05, maxWidth + 16, lineHeight);
      }

      let cursor = logicalLine.direction === "rtl" ? x + maxWidth : x;
      for (const measured of visualLine) {
        const { segment, width } = measured;
        context.font = segmentFont(logicalLine, segment, baseSize).value;
        if (segment.code && !logicalLine.codeBlock) {
          context.fillStyle = "#e5e0ea";
          context.fillRect(
            logicalLine.direction === "rtl" ? cursor - width - 3 : cursor - 3,
            baseline - lineSize * 1.05,
            width + 6,
            lineHeight,
          );
        }
        context.fillStyle = segment.link || segment.marker ? "#6952d6"
          : logicalLine.blockquote ? "#6f6679"
            : "#3a3442";
        context.direction = logicalLine.direction;
        context.textAlign = logicalLine.direction === "rtl" ? "right" : "left";
        context.fillText(segment.text, cursor, baseline);
        cursor += logicalLine.direction === "rtl" ? -width : width;
      }
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
