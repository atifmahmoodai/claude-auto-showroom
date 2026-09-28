import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SyncedInput } from "../components/SyncedInput";
import { VehicleCard } from "../components/VehicleCard";
import { BRANCHES } from "../config";
import { EMPTY_QUERY, filterInventory, paramsFromQuery, queryFromParams, type InventoryQuery, type SortKey } from "../lib/inventory";
import { useStore } from "../store/store";
import { BODY_TYPES, CONDITIONS, FUEL_TYPES, TRANSMISSIONS } from "../types";

const PAGE_SIZE = 12;

export function Inventory() {
  const { data } = useStore();
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => queryFromParams(params), [params]);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [collapsed, setCollapsed] = useState(true);

  const stock = useMemo(() => data.vehicles.filter((v) => v.status !== "Sold"), [data.vehicles]);
  const makes = useMemo(() => [...new Set(stock.map((v) => v.make))].sort(), [stock]);
  const years = useMemo(() => [...new Set(stock.map((v) => v.year))].sort((a, b) => b - a), [stock]);
  const results = useMemo(() => filterInventory(data.vehicles, query), [data.vehicles, query]);

  function update(patch: Partial<InventoryQuery>) {
    setParams(paramsFromQuery({ ...query, ...patch }), { replace: true });
    setShown(PAGE_SIZE);
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
            {results.length} of {stock.length} cars match
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
          {results.length === 0 ? (
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
                {results.slice(0, shown).map((v) => (
                  <VehicleCard key={v.id} v={v} />
                ))}
              </div>
              {shown < results.length && (
                <div style={{ textAlign: "center", marginTop: "1.2rem" }}>
                  <button className="btn" onClick={() => setShown((s) => s + PAGE_SIZE)}>
                    Show more ({results.length - shown} left)
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
