import type { TextDirection } from "./types";

const ARABIC_OR_PERSIAN = /[\u0600-\u06ff\u0750-\u077f\u0870-\u089f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;
const LATIN = /[A-Za-z\u00c0-\u024f\u1e00-\u1eff]/u;

/**
 * Classifies one user-authored line. Mixed Latin and Persian/Arabic is explicitly RTL.
 * Lines without letters use the supplied interface-direction fallback.
 */
export function detectLineDirection(
  line: string,
  fallbackDirection: TextDirection = "ltr",
): TextDirection {
  const hasArabicOrPersian = ARABIC_OR_PERSIAN.test(line);
  const hasLatin = LATIN.test(line);

  if (hasArabicOrPersian) return "rtl";
  if (hasLatin) return "ltr";
  return fallbackDirection;
}

export function splitBidiLines(text: string, fallbackDirection: TextDirection) {
  return text.split("\n").map((line) => ({
    text: line,
    direction: detectLineDirection(line, fallbackDirection),
  }));
}
