import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Department, EquipmentView, SearchMatch } from '../../../shared/types';
import { api } from '../api';
import { BookingPanel } from './BookingPanel';
import { AiBadge, Loading, Notice, PageHeader, StatusBadge, errorMessage } from './ui';

const EXAMPLES = [
  'I need to measure signal noise on my IoT sensor',
  'Train an image classifier on 50k photos',
  'Prototype a plastic enclosure for my circuit board',
];

export function Discover({ aiEnabled }: { aiEnabled: boolean }) {
  const [items, setItems] = useState<EquipmentView[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [department, setDepartment] = useState('');
  const [category, setCategory] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ source: string; matches: SearchMatch[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .catalog({ department, category, available: availableOnly })
      .then((res) => {
        if (!active) return;
        setItems(res.items);
        setCategories(res.categories);
        setDepartments(res.departments);
        setError('');
      })
      .catch((err) => active && setError(errorMessage(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [department, category, availableOnly]);

  async function runSearch(text: string) {
    if (text.trim().length < 2) return;
    setSearching(true);
    setError('');
    try {
      setResults(await api.search(text.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runSearch(query);
  };

  return (
    <>
      <PageHeader
        title="Discover equipment"
        intro="Describe what your project needs in plain language, or browse every lab on campus."
      />

      <section aria-labelledby="search-heading" className="card">
        <h2 id="search-heading" className="h3">
          Ask LabLink {aiEnabled ? <AiBadge source="ai" /> : <AiBadge source="keyword" />}
        </h2>
        <form className="search-row" onSubmit={onSubmit} role="search">
          <label htmlFor="nl-query" className="sr-only">
            Describe what you need
          </label>
          <input
            id="nl-query"
            type="search"
            value={query}
            maxLength={300}
            placeholder="e.g. I need to debug I2C communication on my sensor board"
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={searching || query.trim().length < 2}
          >
            {searching ? 'Searching…' : 'Find equipment'}
          </button>
        </form>
        <div className="chips" aria-label="Example searches">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip"
              onClick={() => {
                setQuery(ex);
                void runSearch(ex);
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        <div aria-live="polite">
          {searching && <Loading label="Finding the best matches" />}
          {results && !searching && <SearchResults results={results} onSelect={setSelected} />}
        </div>
      </section>

      {selected && <BookingPanel equipmentId={selected} onClose={() => setSelected(null)} />}

      <section aria-labelledby="browse-heading">
        <h2 id="browse-heading">Browse all labs</h2>
        <div className="filters">
          <label>
            Department
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
            />
            Available only
          </label>
        </div>
        {error && <Notice tone="bad">{error}</Notice>}
        {loading ? (
          <Loading label="Loading catalogue" />
        ) : (
          <ul className="grid" role="list" aria-label={`${items.length} equipment items`}>
            {items.map((item) => (
              <EquipmentCard key={item.id} item={item} onSelect={setSelected} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function EquipmentCard({
  item,
  reason,
  onSelect,
}: {
  item: EquipmentView;
  reason?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <li className="card equipment">
      <div className="asset-strip">
        <span className="asset-id">
          <span className="sr-only">Asset tag </span>
          {item.id}
        </span>
        <StatusBadge status={item.status} />
      </div>
      <h3 className="h4">{item.name}</h3>
      <dl className="asset-meta">
        <dt>Type</dt>
        <dd>{item.category}</dd>
        <dt>Lab</dt>
        <dd>
          {item.labName}, {item.departmentName}
        </dd>
        <dt>Specs</dt>
        <dd>{item.specs}</dd>
      </dl>
      {reason && (
        <p className="reason small">
          <span aria-hidden="true">✦ </span>
          {reason}
        </p>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={item.status !== 'available'}
        onClick={() => onSelect(item.id)}
      >
        View slots <span className="sr-only">for {item.name}</span>
      </button>
    </li>
  );
}

/** AI or keyword matches for a natural-language query. */
function SearchResults({
  results,
  onSelect,
}: {
  results: { source: string; matches: SearchMatch[] };
  onSelect: (id: string) => void;
}) {
  const count = results.matches.length;
  return (
    <div className="results">
      <p className="muted small">
        {count} match{count === 1 ? '' : 'es'} · <AiBadge source={results.source} />
      </p>
      {count === 0 ? (
        <p>No matching equipment. Try different words or browse below.</p>
      ) : (
        <ul className="grid" role="list">
          {results.matches.map((m) => (
            <EquipmentCard
              key={m.equipment.id}
              item={m.equipment}
              reason={m.reason}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
