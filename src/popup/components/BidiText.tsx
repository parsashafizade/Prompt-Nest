import { Fragment, memo, useMemo } from "react";
import { splitBidiLines } from "../../shared/bidi";
import type { TextDirection } from "../../shared/types";

interface BidiTextProps {
  text: string;
  fallbackDirection: TextDirection;
  className?: string;
}

function BidiTextComponent({ text, fallbackDirection, className = "" }: BidiTextProps) {
  const lines = useMemo(
    () => splitBidiLines(text, fallbackDirection),
    [text, fallbackDirection],
  );

  return (
    <span className={`bidi-text ${className}`.trim()}>
      {lines.map((line, index) => (
        <Fragment key={`${index}-${line.text.slice(0, 12)}`}>
          <span className="bidi-line" dir={line.direction}>{line.text}</span>
          {index < lines.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </span>
  );
}

export const BidiText = memo(BidiTextComponent);
