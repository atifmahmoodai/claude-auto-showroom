import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { EnquiryForm } from "../components/EnquiryForm";
import { FinanceCalculator } from "../components/FinanceCalculator";
import { estimateMonthly, VehicleCard, VehicleMedia } from "../components/VehicleCard";
import { BRANCHES } from "../config";
import { fmtMoney, fmtNumber, vehicleTitle } from "../lib/format";
import { useStore } from "../store/store";

export function VehicleDetail() {
  const { id } = useParams();
  const { data } = useStore();
  const v = data.vehicles.find((x) => x.id === id);

  const similar = useMemo(() => {
    if (!v) return [];
    return data.vehicles
      .filter((x) => x.id !== v.id && x.status !== "Sold" && (x.bodyType === v.bodyType || x.make === v.make))
      .sort((a, b) => Math.abs(a.price - v.price) - Math.abs(b.price - v.price))
      .slice(0, 3);
  }, [data.vehicles, v]);

  if (!v) {
    return (
      <div className="container section">
        <div className="card empty">
          <h1>Vehicle not found</h1>
          <p className="muted">It may have been removed from our stock.</p>
          <Link className="btn btn-primary" to="/inventory">
            Browse inventory
          </Link>
        </div>
      </div>
    );
  }

  const branch = BRANCHES.find((b) => b.id === v.branchId);
  const specs: [string, string][] = [
    ["Year", String(v.year)],
    ["Mileage", `${fmtNumber(v.mileage)} mi`],
    ["Fuel", v.fuel],
    ["Gearbox", v.transmission],
    ["Engine", v.engine],
    ["Body", v.bodyType],
    ["Seats", String(v.seats)],
    ["Colour", v.color],
    ["Condition", v.condition],
    ["Stock no.", v.stockNo],
    ["VIN", v.vin],
    ["Location", branch?.name ?? "—"],
  ];

  return (
    <div className="container">
      <nav className="breadcrumbs muted" aria-label="Breadcrumb">
        <Link to="/">Home</Link> / <Link to="/inventory">Inventory</Link> / {vehicleTitle(v)}
      </nav>

      <div className="detail-grid">
        <div className="stack">
          <div className="detail-media">
            <VehicleMedia v={v} />
          </div>
          <div className="card">
            <div className="row">
              <h1 style={{ margin: 0 }}>{vehicleTitle(v)}</h1>
              {v.status === "Sold" && <span className="badge badge-bad">Sold</span>}
              {v.status === "Reserved" && <span className="badge badge-warn">Reserved</span>}
              {v.condition === "New" && <span className="badge badge-brand">New</span>}
            </div>
            <p className="muted">{v.trim}</p>
            <p>{v.description}</p>
            <dl className="spec-table">
              {specs.map(([k, val]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="card">
            <h2>Features</h2>
            <ul className="feature-list">
              {v.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="stack">
          <div className="card price-box">
            <div className="muted small">Price</div>
            <div className="price">{fmtMoney(v.price)}</div>
            <div className="muted small">or about {fmtMoney(estimateMonthly(v.price))}/month with finance</div>
            {branch && (
              <p className="small" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
                At our <strong>{branch.name}</strong> showroom · <a href={`tel:${branch.phone.replace(/[^\d+]/g, "")}`}>{branch.phone}</a>
              </p>
            )}
          </div>
          {v.status === "Sold" ? (
            <div className="card">
              <h2>This car has been sold</h2>
              <p className="muted">Tell us what you're looking for and we'll find a similar one.</p>
              <EnquiryForm key={v.id} allowTypeSwitch={false} />
            </div>
          ) : (
            <>
              <div className="card">
                <h2>Interested?</h2>
                <EnquiryForm key={v.id} vehicle={v} />
              </div>
              <div className="card">
                <h2>Finance calculator</h2>
                <FinanceCalculator key={v.id} price={v.price} />
              </div>
            </>
          )}
        </div>
      </div>

      {similar.length > 0 && (
        <section className="section">
          <h2>Similar cars</h2>
          <div className="grid-cards">
            {similar.map((s) => (
              <VehicleCard key={s.id} v={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
