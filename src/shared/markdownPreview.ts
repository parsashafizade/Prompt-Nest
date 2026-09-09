import { parser as markdownParser } from "@lezer/markdown";
import katex from "katex";
import { getLineDirection } from "./bidi";
import type { TextDirection } from "./types";

export type MarkdownPreviewRangeKind =
  | "heading"
  | "strong"
  | "emphasis"
  | "inline-code"
  | "fenced-code"
  | "blockquote"
  | "list-marker"
  | "link"
  | "hidden"
  | "inline-math"
  | "block-math";

export interface MarkdownPreviewRange {
  kind: MarkdownPreviewRangeKind;
  from: number;
  to: number;
  activeFrom: number;
  activeTo: number;
  level?: number;
  value?: string;
  block?: boolean;
}

export interface MarkdownPreviewLine {
  from: number;
  to: number;
  text: string;
  direction: TextDirection;
}

export interface MarkdownPreviewModel {
  source: string;
  lines: MarkdownPreviewLine[];
  ranges: MarkdownPreviewRange[];
}

export interface MarkdownPreviewTextSegment {
  kind: "text";
  text: string;
  strong: boolean;
  emphasis: boolean;
  code: boolean;
  link: boolean;
  marker: boolean;
}

export interface MarkdownPreviewMathSegment {
  kind: "math";
  expression: string;
  displayMode: boolean;
}

export type MarkdownPreviewSegment = MarkdownPreviewTextSegment | MarkdownPreviewMathSegment;

export type MarkdownPreviewBlock =
  | {
      kind: "line";
      direction: TextDirection;
      headingLevel?: number;
      blockquote: boolean;
      segments: MarkdownPreviewSegment[];
    }
  | {
      kind: "code";
      lines: Array<{ text: string; direction: TextDirection }>;
    }
  | {
      kind: "math";
      expression: string;
    };

type MarkdownTree = ReturnType<typeof markdownParser.parse>;

interface SourceRange {
  from: number;
  to: number;
}

const CODE_NODE_NAMES = new Set(["InlineCode", "FencedCode", "CodeBlock"]);
const HEADING_NODE_NAMES = new Set([
  "ATXHeading1", "ATXHeading2", "ATXHeading3",
  "ATXHeading4", "ATXHeading5", "ATXHeading6",
]);
const EMPHASIS_NODE_NAMES = new Set(["Emphasis", "StrongEmphasis"]);
const INLINE_CODE_NODE_NAMES = new Set(["InlineCode"]);
const LINK_NODE_NAMES = new Set(["Link"]);
const BLOCKQUOTE_NODE_NAMES = new Set(["Blockquote"]);

function isEscaped(source: string, position: number) {
  let slashCount = 0;
  for (let index = position - 1; index >= 0 && source[index] === "\\"; index -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function maskRanges(source: string, ranges: readonly SourceRange[]) {
  if (!ranges.length) return source;
  // Lezer and RegExp offsets use UTF-16 code units, so do not spread by code point here.
  const characters = source.split("");
  for (const range of ranges) {
    for (let index = range.from; index < range.to; index += 1) {
      if (characters[index] !== "\n") characters[index] = " ";
    }
  }
  return characters.join("");
}

function findMathRanges(source: string, codeRanges: readonly SourceRange[]) {
  const ranges: MarkdownPreviewRange[] = [];
  const withoutCode = maskRanges(source, codeRanges);
  const blockPattern = /\$\$([\s\S]*?)\$\$/g;

  for (const match of withoutCode.matchAll(blockPattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    const closingDelimiter = to - 2;
    const expression = source.slice(from + 2, closingDelimiter);
    if (
      !expression.trim()
      || isEscaped(source, from)
      || isEscaped(source, closingDelimiter)
    ) continue;
    ranges.push({
      kind: "block-math",
      from,
      to,
      activeFrom: from,
      activeTo: to,
      value: expression,
    });
  }

  const withoutBlocks = maskRanges(withoutCode, ranges);
  const inlinePattern = /\$(?!\$)([^$\n]+?)\$(?!\$)/g;
  for (const match of withoutBlocks.matchAll(inlinePattern)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    const closingDelimiter = to - 1;
    const expression = source.slice(from + 1, closingDelimiter);
    if (
      !expression.trim()
      || isEscaped(source, from)
      || isEscaped(source, closingDelimiter)
    ) continue;
    ranges.push({
      kind: "inline-math",
      from,
      to,
      activeFrom: from,
      activeTo: to,
      value: expression,
    });
  }

  return ranges;
}

function markerEndWithSpace(source: string, to: number) {
  return source[to] === " " ? to + 1 : to;
}

function fencedCodeContent(source: string) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const opening = lines[0]?.match(/^\s*(`{3,}|~{3,})/);
  if (!opening) return source;

  const fenceCharacter = opening[1][0];
  const minimumFenceLength = opening[1].length;
  lines.shift();
  const closing = lines.at(-1)?.trim() ?? "";
  const closingPattern = new RegExp(`^${fenceCharacter}{${minimumFenceLength},}\\s*$`);
  if (closingPattern.test(closing)) lines.pop();
  return lines.join("\n");
}

function sourceLines(source: string): MarkdownPreviewLine[] {
  const lines = source.split("\n");
  let position = 0;
  return lines.map((text) => {
    const from = position;
    const to = from + text.length;
    position = to + 1;
    return { from, to, text, direction: getLineDirection(text) };
  });
}

export function createMarkdownPreviewModel(
  source: string,
  tree: MarkdownTree = markdownParser.parse(source),
): MarkdownPreviewModel {
  const ranges: MarkdownPreviewRange[] = [];
  const codeRanges: SourceRange[] = [];

  tree.iterate({
    enter(node) {
      if (!CODE_NODE_NAMES.has(node.name)) return;
      codeRanges.push({ from: node.from, to: node.to });
      if (node.name === "FencedCode" || node.name === "CodeBlock") return false;
    },
  });

  const mathRanges = findMathRanges(source, codeRanges);

  tree.iterate({
    enter(node) {
      const insideMath = mathRanges.some((range) => (
        node.from >= range.from && node.to <= range.to
      ));
      const findAncestor = (names: ReadonlySet<string>) => {
        let parent = node.node.parent;
        while (parent) {
          if (names.has(parent.name)) return parent;
          parent = parent.parent;
        }
        return null;
      };
      const blockquoteOwner = node.name === "Blockquote"
        ? node.node
        : findAncestor(BLOCKQUOTE_NODE_NAMES);
      const addRange = (
        kind: MarkdownPreviewRangeKind,
        activeFrom = node.from,
        activeTo = node.to,
        value?: string,
        level?: number,
      ) => {
        const activeOwner = blockquoteOwner ?? { from: activeFrom, to: activeTo };
        ranges.push({
          kind,
          from: node.from,
          to: node.to,
          activeFrom: activeOwner.from,
          activeTo: activeOwner.to,
          value,
          level,
        });
      };

      if (node.name === "FencedCode") {
        addRange(
          "fenced-code",
          node.from,
          node.to,
          fencedCodeContent(source.slice(node.from, node.to)),
        );
        return false;
      }

      if (node.name === "Blockquote") {
        addRange("blockquote");
        return;
      }

      if (insideMath) return false;

      if (HEADING_NODE_NAMES.has(node.name)) {
        addRange("heading", node.from, node.to, undefined, Number(node.name.at(-1)));
        return;
      }

      if (node.name === "StrongEmphasis") {
        addRange("strong");
        return;
      }

      if (node.name === "Emphasis") {
        addRange("emphasis");
        return;
      }

      if (node.name === "InlineCode") {
        addRange("inline-code");
        return;
      }

      if (node.name === "Link") {
        addRange("link");
        return;
      }

      if (node.name === "HeaderMark") {
        const owner = findAncestor(HEADING_NODE_NAMES);
        if (owner) {
          const activeOwner = blockquoteOwner ?? owner;
          ranges.push({
            kind: "hidden",
            from: node.from,
            to: markerEndWithSpace(source, node.to),
            activeFrom: activeOwner.from,
            activeTo: activeOwner.to,
          });
        }
        return false;
      }

      if (node.name === "EmphasisMark") {
        const owner = findAncestor(EMPHASIS_NODE_NAMES);
        if (owner) addRange("hidden", owner.from, owner.to);
        return false;
      }

      if (node.name === "CodeMark") {
        const owner = findAncestor(INLINE_CODE_NODE_NAMES);
        if (owner) addRange("hidden", owner.from, owner.to);
        return false;
      }

      if (node.name === "QuoteMark") {
        const owner = findAncestor(BLOCKQUOTE_NODE_NAMES);
        if (owner) {
          const activeOwner = blockquoteOwner ?? owner;
          ranges.push({
            kind: "hidden",
            from: node.from,
            to: markerEndWithSpace(source, node.to),
            activeFrom: activeOwner.from,
            activeTo: activeOwner.to,
          });
        }
        return false;
      }

      if (node.name === "ListMark") {
        addRange("list-marker", node.from, node.to, source.slice(node.from, node.to).trim());
        return false;
      }

      if (node.name === "LinkMark") {
        const owner = findAncestor(LINK_NODE_NAMES);
        if (owner) addRange("hidden", owner.from, owner.to);
        return false;
      }

      if (node.name === "URL") {
        const owner = findAncestor(LINK_NODE_NAMES);
        if (owner) addRange("hidden", owner.from, owner.to);
        return false;
      }
    },
  });

  const lines = sourceLines(source);
  for (const mathRange of mathRanges) {
    if (mathRange.kind === "block-math") {
      const firstLine = lines.find((line) => mathRange.from >= line.from && mathRange.from <= line.to);
      const lastLine = lines.find((line) => mathRange.to >= line.from && mathRange.to <= line.to + 1);
      mathRange.block = !firstLine
        || !lastLine
        || firstLine !== lastLine
        || (
          source.slice(firstLine.from, mathRange.from).trim() === ""
          && source.slice(mathRange.to, firstLine.to).trim() === ""
        );
    }
    const blockquote = ranges.find((range) => (
      range.kind === "blockquote"
      && range.from <= mathRange.from
      && range.to >= mathRange.to
    ));
    ranges.push(blockquote ? {
      ...mathRange,
      activeFrom: blockquote.from,
      activeTo: blockquote.to,
    } : mathRange);
  }
  ranges.sort((first, second) => first.from - second.from || first.to - second.to);
  return { source, lines, ranges };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderMathToHtml(expression: string, displayMode: boolean) {
  return katex.renderToString(expression, {
    displayMode,
    output: "htmlAndMathml",
    strict: "ignore",
    throwOnError: false,
  });
}

const SUPERSCRIPT_CHARACTERS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾",
  n: "ⁿ", i: "ⁱ",
};
const SUBSCRIPT_CHARACTERS: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄",
  "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
};

function convertScript(value: string, characters: Record<string, string>, prefix: string) {
  const converted = [...value].map((character) => characters[character]).join("");
  return converted.length === [...value].length ? converted : `${prefix}(${value})`;
}

function mathNodeText(node: Element): string {
  const children = [...node.children];
  const childText = (index: number) => children[index] ? mathNodeText(children[index]) : "";
  const allChildren = () => children.map(mathNodeText).join("");

  switch (node.localName) {
    case "annotation": return "";
    case "semantics": return children[0] ? mathNodeText(children[0]) : "";
    case "mfrac": return `(${childText(0)})/(${childText(1)})`;
    case "msqrt": return `√(${allChildren()})`;
    case "mroot": return `${childText(1)}√(${childText(0)})`;
    case "msup": return childText(0) + convertScript(childText(1), SUPERSCRIPT_CHARACTERS, "^");
    case "msub": return childText(0) + convertScript(childText(1), SUBSCRIPT_CHARACTERS, "_");
    case "msubsup": return childText(0)
      + convertScript(childText(1), SUBSCRIPT_CHARACTERS, "_")
      + convertScript(childText(2), SUPERSCRIPT_CHARACTERS, "^");
    case "mspace": return " ";
    default: return children.length ? allChildren() : (node.textContent ?? "");
  }
}

/** A readable canvas fallback derived from KaTeX's MathML, never from raw delimiters. */
export function renderMathToPlainText(expression: string) {
  if (typeof DOMParser === "undefined") return expression;
  const markup = katex.renderToString(expression, {
    displayMode: false,
    output: "mathml",
    strict: "ignore",
    throwOnError: false,
  });
  const document = new DOMParser().parseFromString(markup, "text/html");
  const math = document.querySelector("math");
  return math ? mathNodeText(math).replace(/[\u2061-\u2064]/gu, "").trim() : expression;
}

function rangesIntersect(first: SourceRange, second: SourceRange) {
  return first.from < second.to && second.from < first.to;
}

function lineIntersectsRange(line: MarkdownPreviewLine, range: SourceRange) {
  return line.from === line.to
    ? line.from >= range.from && line.from < range.to
    : rangesIntersect(line, range);
}

function isStandaloneBlock(range: MarkdownPreviewRange) {
  if (range.kind === "fenced-code") return true;
  return range.kind === "block-math" && range.block === true;
}

function sameTextStyle(
  first: MarkdownPreviewTextSegment,
  second: MarkdownPreviewTextSegment,
) {
  return first.strong === second.strong
    && first.emphasis === second.emphasis
    && first.code === second.code
    && first.link === second.link
    && first.marker === second.marker;
}

function appendTextSegment(
  segments: MarkdownPreviewSegment[],
  segment: MarkdownPreviewTextSegment,
) {
  const previous = segments.at(-1);
  if (previous?.kind === "text" && sameTextStyle(previous, segment)) {
    previous.text += segment.text;
  } else {
    segments.push(segment);
  }
}

function buildInlineSegments(
  model: MarkdownPreviewModel,
  line: MarkdownPreviewLine,
  inlineBlockMath: ReadonlySet<MarkdownPreviewRange>,
) {
  const lineRange = { from: line.from, to: line.to };
  const relevant = model.ranges.filter((range) => (
    rangesIntersect(lineRange, range)
    || (range.from === range.to && range.from >= line.from && range.from <= line.to)
  ));
  const replacements = relevant.filter((range) => (
    range.kind === "list-marker"
    || range.kind === "inline-math"
    || inlineBlockMath.has(range)
  ));
  const hidden = relevant.filter((range) => range.kind === "hidden");
  const styles = relevant.filter((range) => (
    range.kind === "strong"
    || range.kind === "emphasis"
    || range.kind === "inline-code"
    || range.kind === "link"
  ));
  const boundaries = new Set([line.from, line.to]);
  for (const range of [...replacements, ...hidden, ...styles]) {
    boundaries.add(Math.max(line.from, range.from));
    boundaries.add(Math.min(line.to, range.to));
  }
  const points = [...boundaries].sort((first, second) => first - second);
  let skipUntil = line.from;
  const segments: MarkdownPreviewSegment[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (from < skipUntil || from === to) continue;

    const replacement = replacements.find((range) => range.from === from);
    if (replacement) {
      if (replacement.kind === "list-marker") {
        const marker = /^\d/.test(replacement.value ?? "") ? replacement.value : "•";
        appendTextSegment(segments, {
          kind: "text",
          text: marker ?? "•",
          strong: true,
          emphasis: false,
          code: false,
          link: false,
          marker: true,
        });
      } else {
        const displayMode = replacement.kind === "block-math" && replacement.block === true;
        segments.push({
          kind: "math",
          expression: replacement.value ?? "",
          displayMode,
        });
      }
      skipUntil = replacement.to;
      continue;
    }

    const isHidden = hidden.some((range) => range.from <= from && range.to >= to);
    if (isHidden) continue;

    const intervalStyles = styles.filter((range) => range.from <= from && range.to >= to);
    appendTextSegment(segments, {
      kind: "text",
      text: model.source.slice(from, to),
      strong: intervalStyles.some((range) => range.kind === "strong"),
      emphasis: intervalStyles.some((range) => range.kind === "emphasis"),
      code: intervalStyles.some((range) => range.kind === "inline-code"),
      link: intervalStyles.some((range) => range.kind === "link"),
      marker: false,
    });
  }

  return segments;
}

export function createMarkdownPreviewBlocks(model: MarkdownPreviewModel): MarkdownPreviewBlock[] {
  const standaloneBlocks = model.ranges.filter(isStandaloneBlock);
  const inlineBlockMath = new Set(
    model.ranges.filter((range) => range.kind === "block-math" && !standaloneBlocks.includes(range)),
  );
  const renderedBlocks = new Set<MarkdownPreviewRange>();
  const blocks: MarkdownPreviewBlock[] = [];

  for (const line of model.lines) {
    const block = standaloneBlocks.find((range) => lineIntersectsRange(line, range));
    if (block) {
      if (renderedBlocks.has(block)) continue;
      renderedBlocks.add(block);
      if (block.kind === "fenced-code") {
        blocks.push({
          kind: "code",
          lines: (block.value ?? "").split("\n").map((text) => ({
            text,
            direction: getLineDirection(text),
          })),
        });
      } else {
        blocks.push({ kind: "math", expression: block.value ?? "" });
      }
      continue;
    }

    const heading = model.ranges.find((range) => range.kind === "heading" && lineIntersectsRange(line, range));
    const quoted = model.ranges.some((range) => range.kind === "blockquote" && lineIntersectsRange(line, range));
    blocks.push({
      kind: "line",
      direction: line.direction,
      headingLevel: heading?.level,
      blockquote: quoted,
      segments: buildInlineSegments(model, line, inlineBlockMath),
    });
  }

  return blocks;
}

function renderTextSegment(segment: MarkdownPreviewTextSegment) {
  let text = escapeHtml(segment.text);
  if (segment.marker) return `<span class="markdown-preview-list-marker">${text}</span>`;
  if (segment.code) text = `<code>${text}</code>`;
  if (segment.link) text = `<span class="markdown-preview-link">${text}</span>`;
  if (segment.emphasis) text = `<em>${text}</em>`;
  if (segment.strong) text = `<strong>${text}</strong>`;
  return text;
}

function renderSegments(segments: MarkdownPreviewSegment[]) {
  if (!segments.length) return "<br>";
  return segments.map((segment) => (
    segment.kind === "text"
      ? renderTextSegment(segment)
      : `<span class="markdown-preview-math${segment.displayMode ? " markdown-preview-math-block" : ""}" dir="ltr">${renderMathToHtml(segment.expression, segment.displayMode)}</span>`
  )).join("");
}

export function renderMarkdownPreviewHtml(model: MarkdownPreviewModel) {
  return createMarkdownPreviewBlocks(model).map((block) => {
    if (block.kind === "code") {
      const content = block.lines.map(({ text, direction }) => (
        `<span class="markdown-preview-code-line" dir="${direction}">${escapeHtml(text) || "&#8203;"}</span>`
      )).join("");
      return `<pre class="markdown-preview-code-block"><code>${content}</code></pre>`;
    }
    if (block.kind === "math") {
      return `<div class="markdown-preview-math-block" dir="ltr">${renderMathToHtml(block.expression, true)}</div>`;
    }
    const classes = [
      "markdown-preview-line",
      block.headingLevel ? `markdown-preview-heading markdown-preview-heading-${block.headingLevel}` : "",
      block.blockquote ? "markdown-preview-blockquote" : "",
    ].filter(Boolean).join(" ");
    return `<div class="${classes}" dir="${block.direction}">${renderSegments(block.segments)}</div>`;
  }).join("");
}
