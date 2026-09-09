// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { BidiEditor } from "./EditBeforeUseModal";

function EditorHarness() {
  const [value, setValue] = useState("");
  return (
    <BidiEditor
      ariaLabel="Prompt content"
      fallbackDirection="ltr"
      onChange={setValue}
      value={value}
    />
  );
}

function typeLine(line: HTMLDivElement, text: string) {
  line.textContent = text;
  line.focus();
  const range = document.createRange();
  range.selectNodeContents(line);
  range.collapse(false);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.input(line);
}

describe("BidiEditor", () => {
  it("keeps the caret on newly-created lines and classifies each line live", () => {
    const { container } = render(<EditorHarness />);

    typeLine(container.querySelectorAll<HTMLDivElement>(".bidi-editor-line")[0], "Hello");
    fireEvent.keyDown(container.querySelectorAll<HTMLDivElement>(".bidi-editor-line")[0], { key: "Enter" });
    typeLine(container.querySelectorAll<HTMLDivElement>(".bidi-editor-line")[1], "سلام");
    fireEvent.keyDown(container.querySelectorAll<HTMLDivElement>(".bidi-editor-line")[1], { key: "Enter" });
    typeLine(container.querySelectorAll<HTMLDivElement>(".bidi-editor-line")[2], "English first و فارسی");
    fireEvent.keyDown(container.querySelectorAll<HTMLDivElement>(".bidi-editor-line")[2], { key: "Enter" });
    typeLine(container.querySelectorAll<HTMLDivElement>(".bidi-editor-line")[3], "123 !!!");

    const lines = [...container.querySelectorAll<HTMLDivElement>(".bidi-editor-line")];
    expect(lines.map((line) => line.textContent)).toEqual([
      "Hello",
      "سلام",
      "English first و فارسی",
      "123 !!!",
    ]);
    expect(lines.map((line) => line.dir)).toEqual(["ltr", "rtl", "rtl", "ltr"]);
    expect(document.activeElement).toBe(lines[3]);
  });
});
