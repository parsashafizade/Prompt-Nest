// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { BidiEditor } from "./EditBeforeUseModal";

function EditorHarness({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = useState(initialValue);
  return (
    <BidiEditor
      ariaLabel="Prompt content"
      fallbackDirection="ltr"
      onChange={setValue}
      value={value}
    />
  );
}

function inputAt(editor: HTMLTextAreaElement, value: string, caret = value.length) {
  editor.value = value;
  editor.setSelectionRange(caret, caret);
  fireEvent.input(editor);
}

function moveCaret(editor: HTMLTextAreaElement, caret: number) {
  editor.setSelectionRange(caret, caret);
  fireEvent(document, new Event("selectionchange"));
}

describe("BidiEditor", () => {
  it("uses a native textarea and updates direction from typed text", () => {
    const { getByRole } = render(<EditorHarness />);
    const editor = getByRole("textbox", { name: "Prompt content" }) as HTMLTextAreaElement;

    expect(editor.tagName).toBe("TEXTAREA");

    inputAt(editor, "Hello");
    expect(editor.dir).toBe("ltr");

    inputAt(editor, "سلام");
    expect(editor.dir).toBe("rtl");

    inputAt(editor, "English first و فارسی");
    expect(editor.dir).toBe("rtl");

    inputAt(editor, "123 !!!");
    expect(editor.dir).toBe("rtl");
  });

  it("reclassifies from the caret line and retains direction on neutral lines", () => {
    const value = "Hello\nسلام\nEnglish first و فارسی\n123 !!!";
    const { getByRole } = render(<EditorHarness initialValue={value} />);
    const editor = getByRole("textbox", { name: "Prompt content" }) as HTMLTextAreaElement;
    editor.focus();

    moveCaret(editor, 1);
    expect(editor.dir).toBe("ltr");

    moveCaret(editor, value.indexOf("سلام") + 1);
    expect(editor.dir).toBe("rtl");

    moveCaret(editor, value.indexOf("English first") + 1);
    expect(editor.dir).toBe("rtl");

    moveCaret(editor, value.indexOf("123") + 1);
    expect(editor.dir).toBe("rtl");

    moveCaret(editor, 1);
    expect(editor.dir).toBe("ltr");

    moveCaret(editor, value.indexOf("123") + 1);
    expect(editor.dir).toBe("ltr");
  });
});
