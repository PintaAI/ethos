export type CategoryHistoryItem = {
  categoryId: string;
  name: string;
  date: string;
  createdAt: string;
  personalWeight: number;
};

export type RankedCategory = {
  id: string;
  name: string;
};

const IGNORED_MATCH_TOKENS = new Set([
  "a", "an", "and", "at", "for", "from", "in", "of", "on", "the", "to", "with",
  "atau", "dan", "dari", "di", "ke", "pada", "sama", "untuk", "yang",
]);

function dateKeyDaysAgo(dateKey: string, todayKey: string) {
  const date = Date.parse(`${dateKey}T12:00:00Z`);
  const today = Date.parse(`${todayKey}T12:00:00Z`);
  if (!Number.isFinite(date) || !Number.isFinite(today)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Math.floor((today - date) / 86_400_000));
}

export function recencyWeight(dateKey: string, todayKey: string) {
  const daysAgo = dateKeyDaysAgo(dateKey, todayKey);
  if (daysAgo <= 30) return 3;
  if (daysAgo <= 90) return 2;
  return 1;
}

export function normalizeEntryName(value: string) {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function rankCategories<T extends RankedCategory>(categories: T[], history: CategoryHistoryItem[], todayKey: string): T[] {
  const stats = new Map<string, { score: number; recent: string }>();
  for (const item of history) {
    const current = stats.get(item.categoryId) ?? { score: 0, recent: "" };
    current.score += recencyWeight(item.date, todayKey) * item.personalWeight;
    current.recent = current.recent > item.createdAt ? current.recent : item.createdAt;
    stats.set(item.categoryId, current);
  }

  return [...categories].sort((a, b) => {
    const aStats = stats.get(a.id) ?? { score: 0, recent: "" };
    const bStats = stats.get(b.id) ?? { score: 0, recent: "" };
    return bStats.score - aStats.score
      || bStats.recent.localeCompare(aStats.recent)
      || a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      || a.id.localeCompare(b.id);
  });
}

export function suggestCategoryFromNote(note: string, history: CategoryHistoryItem[], todayKey: string) {
  const normalizedNote = normalizeEntryName(note);
  if (!normalizedNote) return null;
  const noteTokens = new Set(normalizedNote.split(" ").filter((token) => !IGNORED_MATCH_TOKENS.has(token)));
  if (noteTokens.size === 0) return null;
  const candidates = new Map<string, { exact: boolean; overlap: number; coverage: number; support: number; recent: string }>();

  for (const item of history) {
    const normalizedHistory = normalizeEntryName(item.name);
    if (!normalizedHistory) continue;
    const historyTokens = new Set(normalizedHistory.split(" ").filter((token) => !IGNORED_MATCH_TOKENS.has(token)));
    if (historyTokens.size === 0) continue;
    const overlap = [...noteTokens].filter((token) => historyTokens.has(token)).length;
    const coverage = overlap / noteTokens.size;
    const exact = normalizedNote === normalizedHistory;
    if (!exact && overlap === 0) continue;

    const current = candidates.get(item.categoryId) ?? { exact: false, overlap: 0, coverage: 0, support: 0, recent: "" };
    current.exact ||= exact;
    current.overlap = Math.max(current.overlap, overlap);
    current.coverage = Math.max(current.coverage, exact ? 1 : coverage);
    current.support += recencyWeight(item.date, todayKey) * item.personalWeight;
    current.recent = current.recent > item.createdAt ? current.recent : item.createdAt;
    candidates.set(item.categoryId, current);
  }

  const ranked = [...candidates.entries()].sort(([, a], [, b]) =>
    Number(b.exact) - Number(a.exact)
      || b.overlap - a.overlap
      || b.coverage - a.coverage
      || b.support - a.support
      || b.recent.localeCompare(a.recent),
  );
  const [best, second] = ranked;
  if (!best) return null;
  const highConfidence = best[1].exact
    ? (!second || !second[1].exact || best[1].support > second[1].support)
    : !second
      || best[1].overlap > second[1].overlap
      || (best[1].coverage > second[1].coverage && best[1].support >= second[1].support)
      || best[1].support >= second[1].support * 1.5;
  return highConfidence ? best[0] : null;
}
