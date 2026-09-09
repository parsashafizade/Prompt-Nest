import { memo, useMemo } from "react";
import "katex/dist/katex.min.css";
import {
  createMarkdownPreviewModel,
  renderMarkdownPreviewHtml,
} from "../../shared/markdownPreview";

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

  return (
    <div
      className={`markdown-preview ${compact ? "markdown-preview-compact" : ""} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export const ReadonlyMarkdown = memo(ReadonlyMarkdownComponent);
