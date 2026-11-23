import type { EquipmentView, SearchMatch } from '../../../shared/types.js';

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'i',
  'need',
  'to',
  'for',
  'my',
  'of',
  'on',
  'in',
  'with',
  'want',
  'some',
  'something',
  'that',
  'can',
  'help',
  'me',
  'is',
  'it',
  'do',
  'use',
  'using',
  'project',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export interface CatalogFilter {
  q?: string;
  departmentId?: string;
  category?: string;
  availableOnly?: boolean;
}

/** Filters the catalogue by department, category and status. */
export function filterCatalog(items: EquipmentView[], f: CatalogFilter): EquipmentView[] {
  return items.filter(
    (e) =>
      (!f.departmentId || departmentOf(e) === f.departmentId) &&
      (!f.category || e.category === f.category) &&
      (!f.availableOnly || e.status === 'available'),
  );
}

const departmentOf = (e: EquipmentView): string => e.labId.split('-')[0] ?? '';

/**
 * Deterministic relevance search: weights matches in name, category, tags and specs.
 * Used directly for keyword search and as the fallback when the AI is unavailable.
 */
export function keywordSearch(items: EquipmentView[], query: string, limit = 8): SearchMatch[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  const scored = items.map((e) => {
    const name = e.name.toLowerCase();
    const category = e.category.toLowerCase();
    const tags = e.tags.join(' ').toLowerCase();
    const specs = e.specs.toLowerCase();
    let score = 0;
    const hits = new Set<string>();
    for (const t of terms) {
      if (category.includes(t)) {
        score += 4;
        hits.add(t);
      }
      if (name.includes(t)) {
        score += 3;
        hits.add(t);
      }
      if (tags.includes(t)) {
        score += 2;
        hits.add(t);
      }
      if (specs.includes(t)) {
        score += 1;
        hits.add(t);
      }
    }
    if (e.status !== 'available') score -= 1;
    return { e, score, hits };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
    .slice(0, limit)
    .map((s) => ({ equipment: s.e, reason: `Matches: ${[...s.hits].join(', ')}` }));
}
