import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SyncedInput } from "../components/SyncedInput";
import { VehicleCard } from "../components/VehicleCard";
import { BRANCHES } from "../config";
import { api } from "../api/client";
import { EMPTY_QUERY, paramsFromQuery, queryFromParams, type InventoryQuery, type SortKey } from "../lib/inventory";
import type { Page, PublicSummary, PublicVehicle } from "../../../shared/schemas";
import { BODY_TYPES, CONDITIONS, FUEL_TYPES, TRANSMISSIONS } from "../types";

const PAGE_SIZE = 12;

export function Inventory() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => queryFromParams(params), [params]);
  const qs = paramsFromQuery(query).toString();
  const [collapsed, setCollapsed] = useState(true);

  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api<PublicSummary>("/public/summary") });
  const makes = summary.data?.makes ?? [];
  const years = summary.data?.years ?? [];
  const stockCount = summary.data?.stockCount ?? 0;
  // Filtering, sorting and paging happen on the server; "Show more" fetches the next page.
  const search = useInfiniteQuery({
    queryKey: ["vehicles", qs],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => api<Page<PublicVehicle>>(`/public/vehicles?${qs}${qs ? "&" : ""}offset=${pageParam}&limit=${PAGE_SIZE}`, { signal }),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
  });
  const results = search.data?.pages.flatMap((p) => p.items) ?? [];
  const total = search.data?.pages[0]?.total ?? 0;

  function update(patch: Partial<InventoryQuery>) {
    setParams(paramsFromQuery({ ...query, ...patch }), { replace: true });
  }

  const numOrNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
  const numText = (s: string) => String(numOrNull(s) ?? "");
  const activeCount = [...paramsFromQuery({ ...query, sort: "featured" }).keys()].length;

  const select = (label: string, value: string, key: keyof InventoryQuery, options: readonly string[], labels?: Record<string, string>) => (
    <label>
      {label}
      <select value={value} onChange={(e) => update({ [key]: e.target.value } as Partial<InventoryQuery>)}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="container section">
      <div className="section-head">
        <div>
          <h1 style={{ margin: 0 }}>Our inventory</h1>
          <p className="muted" style={{ margin: 0 }}>
            {search.isPending ? "Loading…" : `${total} of ${stockCount} cars match`}
          </p>
        </div>
        <label style={{ minWidth: 200 }}>
          Sort by
          <select value={query.sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
            <option value="featured">Featured</option>
            <option value="newest">Newest arrivals</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
            <option value="year-desc">Year: newest first</option>
            <option value="mileage-asc">Mileage: lowest first</option>
          </select>
        </label>
      </div>

      <div className="inventory-layout">
        <aside className={`card filters ${collapsed ? "collapsed" : ""}`} aria-label="Filters">
          <div className="row" style={{ marginBottom: "0.6rem" }}>
            <strong>Filters {activeCount > 0 && <span className="badge badge-brand">{activeCount}</span>}</strong>
            <span className="spacer" />
            {activeCount > 0 && (
              <button className="btn btn-sm" onClick={() => update({ ...EMPTY_QUERY, sort: query.sort })}>
                Clear
              </button>
            )}
            <button className="btn btn-sm filter-toggle" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
              {collapsed ? "Show" : "Hide"}
            </button>
          </div>
          <div className="stack">
            <label>
              Search
              <SyncedInput
                type="search"
                placeholder="e.g. Civic hybrid"
                value={query.q}
                normalize={(s) => s.trim()}
                onCommit={(q) => update({ q })}
              />
            </label>
            {select("Make", query.make, "make", makes)}
            {select("Body type", query.bodyType, "bodyType", BODY_TYPES)}
            {select("Condition", query.condition, "condition", CONDITIONS)}
            {select("Fuel", query.fuel, "fuel", FUEL_TYPES)}
            {select("Gearbox", query.transmission, "transmission", TRANSMISSIONS)}
            {select(
              "Showroom",
              query.branchId,
              "branchId",
              BRANCHES.map((b) => b.id),
              Object.fromEntries(BRANCHES.map((b) => [b.id, b.name])),
            )}
            <div className="two-col">
              <label>
                Min price
                <SyncedInput inputMode="numeric" type="number" min={0} step={1000} value={String(query.minPrice ?? "")} normalize={numText} onCommit={(s) => update({ minPrice: numOrNull(s) })} />
              </label>
              <label>
                Max price
                <SyncedInput inputMode="numeric" type="number" min={0} step={1000} value={String(query.maxPrice ?? "")} normalize={numText} onCommit={(s) => update({ maxPrice: numOrNull(s) })} />
              </label>
            </div>
            <label>
              Year from
              <select value={query.minYear ?? ""} onChange={(e) => update({ minYear: numOrNull(e.target.value) })}>
                <option value="">Any</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}+
                  </option>
                ))}
              </select>
            </label>
            <label>
              Max mileage
              <select value={query.maxMileage ?? ""} onChange={(e) => update({ maxMileage: numOrNull(e.target.value) })}>
                <option value="">Any</option>
                {[100, 10000, 30000, 60000, 100000].map((m) => (
                  <option key={m} value={m}>
                    {m === 100 ? "New only (<100 mi)" : `Up to ${m.toLocaleString()} mi`}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>

        <section>
          {search.isError ? (
            <div className="card empty">
              <h2>Couldn't load cars</h2>
              <p className="muted">Please check your connection and try again.</p>
              <button className="btn btn-primary" onClick={() => void search.refetch()}>
                Retry
              </button>
            </div>
          ) : search.isPending ? (
            <p className="muted">Loading cars…</p>
          ) : results.length === 0 ? (
            <div className="card empty">
              <h2>No cars match those filters</h2>
              <p className="muted">Try widening the price range or clearing a filter.</p>
              <button className="btn btn-primary" onClick={() => update({ ...EMPTY_QUERY })}>
                Clear all filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid-cards">
                {results.map((v) => (
                  <VehicleCard key={v.id} v={v} />
                ))}
              </div>
              {search.hasNextPage && (
                <div style={{ textAlign: "center", marginTop: "1.2rem" }}>
                  <button className="btn" disabled={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
                    {search.isFetchingNextPage ? "Loading…" : `Show more (${total - results.length} left)`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
