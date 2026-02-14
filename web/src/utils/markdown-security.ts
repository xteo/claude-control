export function sanitizeMarkdownHref(rawHref: string | undefined | null): string {
  if (!rawHref) return "#";

  const trimmed = String(rawHref).trim();
  if (!trimmed) return "#";

  // Allow relative links (including same-page anchors and local paths).
  const lower = trimmed.toLowerCase();
  if (!lower.includes(":")) {
    return trimmed;
  }

  const normalizedScheme = lower.split(":", 1)[0];
  const isAllowedAbsoluteScheme =
    normalizedScheme === "http" ||
    normalizedScheme === "https" ||
    normalizedScheme === "mailto";

  if (!isAllowedAbsoluteScheme) {
    return "#";
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") {
      return parsed.toString();
    }
  } catch {
    // Fall through to sanitize.
  }

  return "#";
}
