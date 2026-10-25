export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function parseReactions(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, number> = {};
    for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
      if (typeof count === "number" && count > 0) out[key] = count;
    }
    return out;
  } catch {
    return {};
  }
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return Array.from(trimmed).slice(0, 2).join("").toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Truncate markdown-ish text for list cards, keeping CJK readable. */
export function excerptText(text: string, limit = 160): string {
  const flat = text
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/[#>*_`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit).trimEnd()}…`;
}
