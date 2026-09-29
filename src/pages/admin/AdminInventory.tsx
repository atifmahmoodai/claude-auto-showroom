import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BRANCHES, SALESPEOPLE, branchName, salespersonName } from "../../config";
import { daysBetween, todayLocal } from "../../lib/dates";
import { fmtDate, fmtMoney, fmtNumber, vehicleTitle } from "../../lib/format";
import { useStore } from "../../store/store";
import type { Vehicle } from "../../types";

type StatusFilter = "stock" | "Available" | "Reserved" | "Sold" | "all";

export function AdminInventory() {
  const { data, deleteVehicle, saveVehicle } = useStore();
  const [status, setStatus] = useState<StatusFilter>("stock");
  const [branch, setBranch] = useState("");
  const [q, setQ] = useState("");
  const [selling, setSelling] = useState<Vehicle | null>(null);
  const today = todayLocal();

  const rows = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.vehicles
      .filter((v) => {
        if (status === "stock" && v.status === "Sold") return false;
        if (status !== "stock" && status !== "all" && v.status !== status) return false;
        if (branch && v.branchId !== branch) return false;
        const h = `${v.stockNo} ${v.year} ${v.make} ${v.model} ${v.trim} ${v.vin}`.toLowerCase();
        return tokens.every((t) => h.includes(t));
      })
      .sort((a, b) => (b.soldDate ?? b.acquiredDate).localeCompare(a.soldDate ?? a.acquiredDate));
  }, [data.vehicles, status, branch, q]);

  const shown = rows.slice(0, 200);

  return (
    <>
      <div className="page-head">
        <h1>Inventory</h1>
        <span className="spacer" />
        <Link to="/admin/inventory/new" className="btn btn-primary">
          + Add vehicle
        </Link>
      </div>

      <div className="filter-bar">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="stock">In stock (available + reserved)</option>
            <option value="Available">Available</option>
            <option value="Reserved">Reserved</option>
            <option value="Sold">Sold</option>
            <option value="all">All</option>
          </select>
        </label>
        <label>
          Branch
          <select value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="">All branches</option>
            {BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 200 }}>
          Search
          <input type="search" placeholder="Stock no, VIN, make, model…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <p className="muted small">
        {rows.length} vehicles{rows.length > shown.length ? ` · showing the first ${shown.length}` : ""}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stock no</th>
              <th>Vehicle</th>
              <th>Branch</th>
              <th>Status</th>
              <th className="r">Price</th>
              <th className="r">Cost</th>
              <th className="r">Days</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((v) => {
              const days = daysBetween(v.acquiredDate, v.soldDate ?? today);
              return (
                <tr key={v.id}>
                  <td className="num">{v.stockNo}</td>
                  <td>
                    <Link to={`/admin/inventory/${v.id}`}>{vehicleTitle(v)}</Link>
                    <div className="muted small">
                      {v.trim} · {fmtNumber(v.mileage)} mi · {v.color}
                    </div>
                  </td>
                  <td>{branchName(v.branchId)}</td>
                  <td>
                    <span className={`badge ${v.status === "Sold" ? "" : v.status === "Reserved" ? "badge-warn" : "badge-good"}`}>{v.status}</span>
                    {v.status === "Sold" && v.soldDate && (
                      <div className="muted small">
                        {fmtDate(v.soldDate)} · {salespersonName(v.salespersonId)}
                      </div>
                    )}
                  </td>
                  <td className="r">
                    {fmtMoney(v.salePrice ?? v.price)}
                    {v.status === "Sold" && <div className="muted small">list {fmtMoney(v.price)}</div>}
                  </td>
                  <td className="r">{fmtMoney(v.cost)}</td>
                  <td className="r">{days > 90 && v.status !== "Sold" ? <span className="badge badge-warn">⚠ {days}</span> : days}</td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      {v.status !== "Sold" && (
                        <>
                          <button className="btn btn-sm" onClick={() => setSelling(v)}>
                            Mark sold
                          </button>
                          <button
                            className="btn btn-sm"
                            onClick={() => saveVehicle({ ...v, status: v.status === "Reserved" ? "Available" : "Reserved" })}
                          >
                            {v.status === "Reserved" ? "Unreserve" : "Reserve"}
                          </button>
                        </>
                      )}
                      {/* Sold cars are sales records (dashboard, Power BI); deleting them would rewrite history. */}
                      {v.status !== "Sold" && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            if (window.confirm(`Delete ${vehicleTitle(v)} (${v.stockNo})? This cannot be undone.`)) deleteVehicle(v.id);
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: "center", padding: "2rem" }}>
                  No vehicles match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selling && <SellDialog v={selling} onClose={() => setSelling(null)} />}
    </>
  );
}

function SellDialog({ v, onClose }: { v: Vehicle; onClose: () => void }) {
  const { markSold } = useStore();
  const today = todayLocal();
  const sellers = SALESPEOPLE.filter((s) => s.branchId === v.branchId);
  const [price, setPrice] = useState(String(v.price));
  const [date, setDate] = useState(today);
  const [seller, setSeller] = useState(sellers[0]?.id ?? SALESPEOPLE[0].id);
  const priceNum = Number(price);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const error =
    !Number.isFinite(priceNum) || priceNum <= 0
      ? "Enter the final sale price."
      : !date || date < v.acquiredDate
        ? "Sale date can't be before the car was acquired."
        : date > today
          ? "Sale date can't be in the future."
          : "";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Record sale" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: 0 }}>Record sale</h2>
        <p className="muted" style={{ margin: 0 }}>
          {vehicleTitle(v)} · {v.stockNo}
        </p>
        <label>
          Final sale price
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <div className="two-col">
          <label>
            Sale date
            <input type="date" value={date} min={v.acquiredDate} max={today} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Salesperson
            <select value={seller} onChange={(e) => setSeller(e.target.value)}>
              {SALESPEOPLE.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({branchName(s.branchId)})
                </option>
              ))}
            </select>
          </label>
        </div>
        {Number.isFinite(priceNum) && priceNum > 0 && (
          <p className="small" style={{ margin: 0 }}>
            Gross profit on this deal:{" "}
            <strong style={{ color: priceNum - v.cost >= 0 ? "var(--good)" : "var(--bad)" }}>{fmtMoney(priceNum - v.cost)}</strong>
          </p>
        )}
        {error && <div className="field-error">{error}</div>}
        <div className="row">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!!error}
            onClick={() => {
              markSold(v.id, { salePrice: Math.round(priceNum), soldDate: date, salespersonId: seller });
              onClose();
            }}
          >
            Save sale
          </button>
        </div>
      </div>
    </div>
  );
}
