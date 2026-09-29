import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CarArt } from "../components/CarArt";
import { VehicleCard } from "../components/VehicleCard";
import { SITE } from "../config";
import { fmtMoney } from "../lib/format";
import { api } from "../api/client";
import { BODY_TYPES } from "../types";
import type { PublicSummary } from "../../../shared/schemas";

const PRICE_CAPS = [15000, 25000, 35000, 50000, 75000];

export function Home() {
  const navigate = useNavigate();
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api<PublicSummary>("/public/summary") });
  const s = summary.data;
  const stockCount = s?.stockCount ?? 0;
  const makes = s?.makes ?? [];
  const featured = s?.featured ?? [];
  const lowest = s?.lowestPrice ?? 0;
  const [make, setMake] = useState("");
  const [max, setMax] = useState("");

  function search(e: FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (make) p.set("make", make);
    if (max) p.set("max", max);
    const qs = p.toString();
    navigate(`/inventory${qs ? `?${qs}` : ""}`);
  }

  const hero = featured[0];

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="badge badge-brand">{s ? `${stockCount} cars in stock today` : "Loading stock…"}</span>
            <h1 style={{ marginTop: "0.8rem" }}>Find your next car at {SITE.name}</h1>
            <p className="lead">{SITE.tagline} Every used car is inspected, and finance is available on every vehicle.</p>
            <form className="hero-search" onSubmit={search}>
              <label>
                Make
                <select value={make} onChange={(e) => setMake(e.target.value)}>
                  <option value="">Any make</option>
                  {makes.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Max price
                <select value={max} onChange={(e) => setMax(e.target.value)}>
                  <option value="">No limit</option>
                  {PRICE_CAPS.map((p) => (
                    <option key={p} value={p}>
                      {fmtMoney(p)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary" type="submit">
                Search cars
              </button>
            </form>
            <div className="stats-strip">
              <div>
                <strong>{stockCount}</strong>
                <span className="muted small">vehicles available</span>
              </div>
              <div>
                <strong>{makes.length}</strong>
                <span className="muted small">brands</span>
              </div>
              <div>
                <strong>{fmtMoney(lowest)}</strong>
                <span className="muted small">starting price</span>
              </div>
            </div>
          </div>
          <div className="hero-art">
            {hero ? <CarArt bodyType={hero.bodyType} colorHex={hero.colorHex} /> : <CarArt bodyType="SUV" colorHex="#1e3a8a" />}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <div>
              <h2>Featured cars</h2>
              <p className="muted" style={{ margin: 0 }}>
                Hand-picked from this week's stock.
              </p>
            </div>
            <Link to="/inventory" className="btn">
              View all {stockCount} cars →
            </Link>
          </div>
          {summary.isError ? (
            <p className="muted">Couldn't load our cars right now. Please refresh the page.</p>
          ) : summary.isPending ? (
            <p className="muted">Loading…</p>
          ) : featured.length ? (
            <div className="grid-cards">
              {featured.map((v) => (
                <VehicleCard key={v.id} v={v} />
              ))}
            </div>
          ) : (
            <p className="muted">New stock arriving soon.</p>
          )}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <h2>Shop by body type</h2>
          <div className="body-types">
            {BODY_TYPES.map((b) => (
              <Link key={b} to={`/inventory?body=${b}`} className="body-type">
                <CarArt bodyType={b} colorHex="#94a3b8" />
                {b} <span className="muted small">({s?.bodyCounts[b] ?? 0})</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container why-grid">
          {[
            ["150-point inspection", "Every used car is checked by our technicians before it goes on sale."],
            ["Finance in minutes", "Estimate payments on any car, then get a quote from our finance team."],
            ["Trade-ins welcome", "Bring your current car for a same-day valuation."],
            ["7-day exchange", "Changed your mind? Swap for another car within 7 days."],
          ].map(([t, d]) => (
            <div key={t} className="card">
              <h3>{t}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {d}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
