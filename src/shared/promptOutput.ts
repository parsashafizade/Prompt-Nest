import { getProtectedMarkdownRanges } from "./markdownPreview";
import type { ContextBlock, NoteAttachment } from "./types";

export interface PromptVariableOccurrence {
  name: string;
  from: number;
  to: number;
}

function intersects(from: number, to: number, protectedRanges: ReadonlyArray<{ from: number; to: number }>) {
  return protectedRanges.some((range) => from < range.to && range.from < to);
}

export function findPromptVariableOccurrences(source: string): PromptVariableOccurrence[] {
  const protectedRanges = getProtectedMarkdownRanges(source);
  const occurrences: PromptVariableOccurrence[] = [];
  for (const match of source.matchAll(/\{\{([^{}\n]+)\}\}/gu)) {
    const from = match.index ?? 0;
    const to = from + match[0].length;
    const name = match[1].trim();
    if (name && !intersects(from, to, protectedRanges)) occurrences.push({ name, from, to });
  }
  return occurrences;
}

export function getPromptVariableNames(source: string) {
  return [...new Set(findPromptVariableOccurrences(source).map(({ name }) => name))];
}

export function substitutePromptVariables(source: string, values: Readonly<Record<string, string>>) {
  let result = source;
  for (const occurrence of findPromptVariableOccurrences(source).reverse()) {
    result = result.slice(0, occurrence.from) + (values[occurrence.name] ?? "") + result.slice(occurrence.to);
  }
  return result;
}

export function composePromptSource(
  content: string,
  contextBlockIds: readonly string[],
  contextBlocks: readonly ContextBlock[],
) {
  const blockById = new Map(contextBlocks.map((block) => [block.id, block]));
  return [
    ...contextBlockIds.map((id) => blockById.get(id)?.content).filter((value): value is string => Boolean(value)),
    content,
  ].filter(Boolean).join("\n\n");
}

export function noteShareText(note: string, attachments: readonly NoteAttachment[]) {
  return [
    note.trim(),
    ...attachments.map((attachment) => attachment.kind === "image"
      ? attachment.caption.trim()
      : [attachment.header.trim(), attachment.location.trim()].filter(Boolean).join("\n")),
  ].filter(Boolean).join("\n\n");
}
