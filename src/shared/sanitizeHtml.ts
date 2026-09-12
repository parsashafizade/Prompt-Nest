import DOMPurify, { type Config } from "dompurify";

const RENDERED_HTML_CONFIG: Config = {
  USE_PROFILES: { html: true, mathMl: true, svg: true, svgFilters: true },
  ALLOW_ARIA_ATTR: true,
  ALLOW_DATA_ATTR: true,
  ADD_ATTR: ["dir"],
  FORBID_TAGS: ["script", "style"],
  FORBID_ATTR: ["onerror", "onload", "onclick"],
};

const STATIC_OVERLAY_CONFIG: Config = {
  ...RENDERED_HTML_CONFIG,
  ADD_TAGS: ["style"],
  FORBID_TAGS: ["script"],
};

export function sanitizeRenderedHtml(html: string): DocumentFragment {
  return DOMPurify.sanitize(html, {
    ...RENDERED_HTML_CONFIG,
    RETURN_DOM_FRAGMENT: true,
  });
}

export function sanitizeStaticOverlayHtml(html: string): string {
  return DOMPurify.sanitize(html, STATIC_OVERLAY_CONFIG);
}
