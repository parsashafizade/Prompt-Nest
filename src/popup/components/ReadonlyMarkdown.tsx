import { memo, useLayoutEffect, useMemo, useRef } from "react";
import "katex/dist/katex.min.css";
import {
  createMarkdownPreviewModel,
  renderMarkdownPreviewHtml,
} from "../../shared/markdownPreview";
import { sanitizeRenderedHtml } from "../../shared/sanitizeHtml";

interface ReadonlyMarkdownProps {
  value: string;
  className?: string;
  compact?: boolean;
}

function ReadonlyMarkdownComponent({
  value,
  className = "",
  compact = false,
}: ReadonlyMarkdownProps) {
  const html = useMemo(
    () => renderMarkdownPreviewHtml(createMarkdownPreviewModel(value)),
    [value],
  );
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    containerRef.current?.replaceChildren(sanitizeRenderedHtml(html));
  }, [html]);

  return (
    <div
      className={`markdown-preview ${compact ? "markdown-preview-compact" : ""} ${className}`.trim()}
      ref={containerRef}
    />
  );
}

export const ReadonlyMarkdown = memo(ReadonlyMarkdownComponent);
