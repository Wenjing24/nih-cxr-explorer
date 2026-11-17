import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadDataset, type Dataset } from './lib/data';
import { filtersFromQuery, filtersToQuery, type Filters } from './lib/filters';
import { TooltipProvider } from './components/chart';
import { OverviewPage } from './pages/Overview';
import { ComplexityPage } from './pages/Complexity';
import { CooccurrencePage } from './pages/Cooccurrence';
import { DemographicsPage } from './pages/Demographics';
import { ImagesPerPatientPage } from './pages/ImagesPerPatient';
import { ViewPositionPage } from './pages/ViewPosition';

export const ROUTES = [
  { id: 'overview', label: 'Overview', task: false },
  { id: 'complexity', label: 'Variables vs. complexity', task: false },
  { id: 'cooccurrence', label: 'Finding co-occurrence', task: true },
  { id: 'demographics', label: 'Findings by age & gender', task: true },
  { id: 'images-per-patient', label: 'Images per patient', task: true },
  { id: 'view-position', label: 'View position (AP/PA)', task: true },
] as const;
export type RouteId = (typeof ROUTES)[number]['id'];

function parseHash(): { route: RouteId; query: string } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const route = (ROUTES.find((r) => r.id === path)?.id ?? 'overview') as RouteId;
  return { route, query };
}

export interface PageProps {
  ds: Dataset;
  filters: Filters;
  setFilters: (f: Filters) => void;
}

export default function App({ dataUrl = 'data/images.json', preloaded }: { dataUrl?: string; preloaded?: Dataset }) {
  const [ds, setDs] = useState<Dataset | null>(preloaded ?? null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteId>(() => parseHash().route);
  const [filters, setFiltersState] = useState<Filters | null>(null);

  useEffect(() => {
    if (preloaded) return;
    loadDataset(dataUrl).then(setDs).catch((e) => setError(String(e.message ?? e)));
  }, [dataUrl, preloaded]);

  // initialise filters from the URL once findings are known
  useEffect(() => {
    if (ds && !filters) setFiltersState(filtersFromQuery(parseHash().query, ds.findings));
  }, [ds, filters]);

  // keep the URL in sync (shareable links, survives reload)
  useEffect(() => {
    if (!filters) return;
    const next = `#/${route}?${filtersToQuery(filters)}`;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }, [route, filters]);

  useEffect(() => {
    const onHash = () => {
      const { route: r, query } = parseHash();
      setRoute(r);
      if (ds && query) setFiltersState(filtersFromQuery(query, ds.findings));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [ds]);

  // keep the active tab visible in the horizontally scrolling nav (phones)
  useEffect(() => {
    const el = document.querySelector('.tabs a.active') as HTMLElement | null;
    const nav = el?.parentElement;
    if (el && nav && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: el.offsetLeft - nav.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [route]);

  const go = useCallback((r: RouteId) => {
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);

  const setFilters = useCallback((f: Filters) => setFiltersState(f), []);

  const page = useMemo(() => {
    if (!ds || !filters) return null;
    const props = { ds, filters, setFilters };
    switch (route) {
      case 'overview': return <OverviewPage ds={ds} />;
      case 'complexity': return <ComplexityPage ds={ds} />;
      case 'cooccurrence': return <CooccurrencePage {...props} />;
      case 'demographics': return <DemographicsPage {...props} />;
      case 'images-per-patient': return <ImagesPerPatientPage {...props} />;
      case 'view-position': return <ViewPositionPage {...props} />;
    }
  }, [ds, filters, route, setFilters]);

  return (
    <TooltipProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="logo" aria-hidden>
              <svg viewBox="0 0 32 32" width="28" height="28"><rect width="32" height="32" rx="7" fill="var(--ink)" /><path d="M16 6v20M10 10c-3 2-4 7-3 12 2 1 5 1 7-1M22 10c3 2 4 7 3 12-2 1-5 1-7-1M11 14h4M17 14h4M11 18h4M17 18h4" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
            </span>
            <div>
              <h1>NIH Chest X-Ray Explorer</h1>
              <p className="tagline">ChestX-ray14 metadata · 112,120 images · 30,805 patients</p>
            </div>
          </div>
          <nav className="tabs" aria-label="Pages">
            {ROUTES.map((r, i) => (
              <a
                key={r.id}
                href={`#/${r.id}${filters ? `?${filtersToQuery(filters)}` : ''}`}
                className={route === r.id ? 'active' : ''}
                aria-current={route === r.id ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(r.id);
                }}
              >
                <span className="tab-num">{i + 1}</span>
                {r.label}
                {r.task && <span className="tab-badge" title="Uses the shared filters">filters</span>}
              </a>
            ))}
          </nav>
        </header>

        <main className="main">
          {error && (
            <div className="error" role="alert">
              <strong>Could not load the metadata.</strong> {error}
            </div>
          )}
          {!error && !page && (
            <div className="loading" role="status">
              <div className="spinner" aria-hidden />
              Loading 112,120 image records…
            </div>
          )}
          {page}
        </main>

        <footer className="footer">
          <p>
            Data: <a href="https://nihcc.app.box.com/v/ChestXray-NIHCC" target="_blank" rel="noreferrer">NIH ChestX-ray14 (original download site)</a>,
            provided by the <strong>NIH Clinical Center</strong>. Only the metadata table (<code>Data_Entry_2017.csv</code>) is used; no images are loaded.
          </p>
          <p className="cite">
            Wang X, Peng Y, Lu L, Lu Z, Bagheri M, Summers RM. “ChestX-ray8: Hospital-scale Chest X-ray Database and Benchmarks on Weakly-Supervised
            Classification and Localization of Common Thorax Diseases.” <em>IEEE CVPR</em>, 2017, pp. 3462–3471.{' '}
            <a href="https://doi.org/10.1109/CVPR.2017.369" target="_blank" rel="noreferrer">doi:10.1109/CVPR.2017.369</a>
          </p>
          <p className="muted">Finding labels were text-mined from radiology reports (NLP) and are imperfect. BMI 706 course prototype — not for clinical use.</p>
        </footer>
      </div>
    </TooltipProvider>
  );
}
