import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type Range,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import "katex/dist/katex.min.css";
import { useEffect, useRef, type CSSProperties } from "react";
import { getLineDirection } from "../../shared/bidi";
import {
  createMarkdownPreviewModel,
  renderMathToHtml,
  type MarkdownPreviewRange,
} from "../../shared/markdownPreview";

interface MarkdownPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  autoFocus?: boolean;
  minHeight?: number;
}

interface SourceRange {
  from: number;
  to: number;
}

type DecorationRange = Range<Decoration>;

const externalValueUpdate = Annotation.define<boolean>();

function selectionTouchesRange(state: EditorState, range: SourceRange) {
  return state.selection.ranges.some((selection) => (
    selection.empty
      ? selection.head >= range.from && selection.head <= range.to
      : selection.from < range.to && selection.to > range.from
  ));
}

function collectActiveLines(state: EditorState) {
  const activeLines = new Set<number>();
  for (const selection of state.selection.ranges) {
    const firstLine = state.doc.lineAt(selection.from).number;
    const lastLine = state.doc.lineAt(selection.to).number;
    for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
      activeLines.add(lineNumber);
    }
  }
  return activeLines;
}

function lineRangeIsActive(
  state: EditorState,
  activeLines: ReadonlySet<number>,
  range: SourceRange,
) {
  const firstLine = state.doc.lineAt(range.from).number;
  const lastPosition = Math.max(range.from, range.to - 1);
  const lastLine = state.doc.lineAt(lastPosition).number;
  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    if (activeLines.has(lineNumber)) return true;
  }
  return false;
}

function addLineClasses(
  ranges: DecorationRange[],
  state: EditorState,
  sourceRange: SourceRange,
  className: string,
) {
  const firstLine = state.doc.lineAt(sourceRange.from).number;
  const lastPosition = Math.max(sourceRange.from, sourceRange.to - 1);
  const lastLine = state.doc.lineAt(lastPosition).number;
  for (let lineNumber = firstLine; lineNumber <= lastLine; lineNumber += 1) {
    ranges.push(Decoration.line({ attributes: { class: className } }).range(
      state.doc.line(lineNumber).from,
    ));
  }
}

function previewRangeIsActive(
  state: EditorState,
  activeLines: ReadonlySet<number>,
  range: MarkdownPreviewRange,
) {
  const activeRange = { from: range.activeFrom, to: range.activeTo };
  return range.kind === "fenced-code"
    || range.kind === "blockquote"
    || (range.kind === "block-math" && range.block)
    ? selectionTouchesRange(state, activeRange)
    : lineRangeIsActive(state, activeLines, activeRange);
}

class ListMarkerWidget extends WidgetType {
  constructor(private readonly label: string) {
    super();
  }

  eq(other: ListMarkerWidget) {
    return other.label === this.label;
  }

  toDOM() {
    const marker = document.createElement("span");
    marker.className = "cm-live-list-marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = this.label;
    return marker;
  }

  ignoreEvent() {
    return false;
  }
}

class FencedCodeWidget extends WidgetType {
  constructor(private readonly content: string) {
    super();
  }

  eq(other: FencedCodeWidget) {
    return other.content === this.content;
  }

  toDOM() {
    const container = document.createElement("pre");
    const code = document.createElement("code");
    container.className = "cm-live-code-block";
    this.content.split("\n").forEach((line) => {
      const lineElement = document.createElement("span");
      lineElement.className = "cm-live-code-line";
      lineElement.dir = getLineDirection(line);
      lineElement.textContent = line;
      code.append(lineElement);
    });
    container.append(code);
    return container;
  }

  ignoreEvent() {
    return false;
  }
}

class MathWidget extends WidgetType {
  constructor(
    private readonly expression: string,
    private readonly displayMode: boolean,
  ) {
    super();
  }

  eq(other: MathWidget) {
    return other.expression === this.expression && other.displayMode === this.displayMode;
  }

  toDOM() {
    const element = document.createElement(this.displayMode ? "div" : "span");
    element.className = this.displayMode ? "cm-live-math-block" : "cm-live-math-inline";
    element.dir = "ltr";
    element.innerHTML = renderMathToHtml(this.expression, this.displayMode);
    return element;
  }

  ignoreEvent() {
    return false;
  }
}

function buildDecorations(view: EditorView) {
  const { state } = view;
  const ranges: DecorationRange[] = [];
  const activeLines = collectActiveLines(state);
  const model = createMarkdownPreviewModel(state.doc.toString(), syntaxTree(state));

  for (const line of model.lines) {
    ranges.push(Decoration.line({
      attributes: { dir: line.direction },
    }).range(line.from));
  }

  for (const range of model.ranges) {
    if (previewRangeIsActive(state, activeLines, range)) continue;

    if (range.kind === "fenced-code") {
      ranges.push(Decoration.replace({
        block: true,
        widget: new FencedCodeWidget(range.value ?? ""),
      }).range(range.from, range.to));
    } else if (range.kind === "blockquote") {
      addLineClasses(ranges, state, range, "cm-live-blockquote");
    } else if (range.kind === "heading") {
      addLineClasses(
        ranges,
        state,
        range,
        `cm-live-heading cm-live-heading-${range.level}`,
      );
    } else if (range.kind === "strong") {
      ranges.push(Decoration.mark({ class: "cm-live-strong" }).range(range.from, range.to));
    } else if (range.kind === "emphasis") {
      ranges.push(Decoration.mark({ class: "cm-live-emphasis" }).range(range.from, range.to));
    } else if (range.kind === "inline-code") {
      ranges.push(Decoration.mark({ class: "cm-live-inline-code" }).range(range.from, range.to));
    } else if (range.kind === "link") {
      ranges.push(Decoration.mark({ class: "cm-live-link" }).range(range.from, range.to));
    } else if (range.kind === "hidden") {
      ranges.push(Decoration.replace({}).range(range.from, range.to));
    } else if (range.kind === "list-marker") {
      const marker = /^\d/.test(range.value ?? "") ? range.value : "•";
      ranges.push(Decoration.replace({
        widget: new ListMarkerWidget(marker ?? "•"),
      }).range(range.from, range.to));
    } else if (range.kind === "inline-math" || range.kind === "block-math") {
      const displayMode = range.kind === "block-math" && range.block === true;
      ranges.push(Decoration.replace({
        block: displayMode,
        widget: new MathWidget(range.value ?? "", displayMode),
      }).range(range.from, range.to));
    }
  }

  return Decoration.set(ranges, true);
}

const promptPreviewPlugin = ViewPlugin.fromClass(class {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = buildDecorations(update.view);
    }
  }
}, {
  decorations: (plugin) => plugin.decorations,
});

export function MarkdownPromptEditor({
  value,
  onChange,
  ariaLabel,
  autoFocus = false,
  minHeight = 180,
}: MarkdownPromptEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const ariaCompartmentRef = useRef(new Compartment());

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) return undefined;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          promptPreviewPlugin,
          ariaCompartmentRef.current.of(EditorView.contentAttributes.of({
            "aria-label": ariaLabel,
            "aria-multiline": "true",
            spellcheck: "true",
          })),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged
              && !update.transactions.some((transaction) => transaction.annotation(externalValueUpdate))
            ) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (autoFocus) view.focus();

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({
      annotations: [
        externalValueUpdate.of(true),
        Transaction.addToHistory.of(false),
      ],
      changes: { from: 0, to: view.state.doc.length, insert: value },
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: ariaCompartmentRef.current.reconfigure(EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        spellcheck: "true",
      })),
    });
  }, [ariaLabel]);

  const style = {
    "--markdown-editor-min-height": `${minHeight}px`,
  } as CSSProperties;

  return <div className="markdown-editor" ref={hostRef} style={style} />;
}
