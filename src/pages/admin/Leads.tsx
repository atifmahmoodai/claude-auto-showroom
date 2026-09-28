import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BRANCHES, SALESPEOPLE } from "../../config";
import { addDays, todayLocal } from "../../lib/dates";
import { fmtDate, fmtMinutes, vehicleTitle } from "../../lib/format";
import { useStore } from "../../store/store";
import { LEAD_SOURCES, LEAD_STAGES, type Lead, type LeadStage } from "../../types";

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 0, label: "All time" },
];
const PER_COLUMN = 40;

export function Leads() {
  const { data, moveLead, assignLead } = useStore();
  const [days, setDays] = useState(30);
  const [branch, setBranch] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const today = todayLocal();
  const vehicles = useMemo(() => new Map(data.vehicles.map((v) => [v.id, v])), [data.vehicles]);

  const filtered = useMemo(() => {
    const since = days ? addDays(today, -(days - 1)) : "";
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.leads
      .filter((l) => {
        if (since && l.createdAt.slice(0, 10) < since) return false;
        if (branch && l.branchId !== branch) return false;
        if (source && l.source !== source) return false;
        if (tokens.length) {
          const v = l.vehicleId ? vehicles.get(l.vehicleId) : undefined;
          const h = `${l.name} ${l.email} ${l.phone} ${v ? vehicleTitle(v) : ""}`.toLowerCase();
          if (!tokens.every((t) => h.includes(t))) return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [data.leads, days, branch, source, q, today, vehicles]);

  const byStage = useMemo(() => {
    const m = new Map<LeadStage, Lead[]>(LEAD_STAGES.map((s) => [s, []]));
    for (const l of filtered) m.get(l.stage)!.push(l);
    return m;
  }, [filtered]);

  const waiting = byStage.get("New")!.filter((l) => l.firstResponseMinutes === undefined).length;

  return (
    <>
      <div className="page-head">
        <h1>Leads</h1>
        {waiting > 0 && <span className="badge badge-bad">⚠ {waiting} waiting for a first reply</span>}
      </div>

      <div className="filter-bar">
        <label>
          Created
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {PERIODS.map((p) => (
              <option key={p.days} value={p.days}>
                {p.label}
              </option>
            ))}
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
        <label>
          Source
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {LEAD_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1, minWidth: 200 }}>
          Search
          <input type="search" placeholder="Name, email, phone or car" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      <p className="muted small">
        {filtered.length} leads. Change a lead's stage with its dropdown; moving a lead out of "New" records the first-response time. Marking a lead "Won" doesn't sell the car; record the sale from Inventory.
      </p>

      <div className="board">
        {LEAD_STAGES.map((stage) => {
          const items = byStage.get(stage)!;
          return (
            <section key={stage} className="board-col" aria-label={`${stage} leads`}>
              <h3>
                {stage} <span className="badge">{items.length}</span>
              </h3>
              {items.slice(0, PER_COLUMN).map((l) => (
                <LeadCard
                  key={l.id}
                  lead={l}
                  vehicleLabel={l.vehicleId ? vehicles.get(l.vehicleId) : undefined}
                  onMove={(s) => moveLead(l.id, s)}
                  onAssign={(sp) => assignLead(l.id, sp)}
                />
              ))}
              {items.length > PER_COLUMN && <p className="muted small">+ {items.length - PER_COLUMN} older — narrow the filters to see them.</p>}
              {items.length === 0 && <p className="muted small" style={{ padding: "0 0.3rem" }}>No leads</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}

function waitingFor(createdAt: string): number {
  return Math.max(0, (Date.now() - Date.parse(createdAt)) / 60_000);
}

function LeadCard({
  lead,
  vehicleLabel,
  onMove,
  onAssign,
}: {
  lead: Lead;
  vehicleLabel?: { id: string; year: number; make: string; model: string; status: string };
  onMove: (s: LeadStage) => void;
  onAssign: (id: string | undefined) => void;
}) {
  const sellers = SALESPEOPLE.filter((s) => s.branchId === lead.branchId);
  const unanswered = lead.stage === "New" && lead.firstResponseMinutes === undefined;
  return (
    <article className="lead-card">
      <div className="row" style={{ gap: "0.3rem" }}>
        <strong>{lead.name}</strong>
        <span className="spacer" />
        <span className="badge">{lead.source}</span>
      </div>
      <div className="muted small">
        {lead.type} · {fmtDate(lead.createdAt)}
        {lead.preferredDate && <> · drive {fmtDate(lead.preferredDate)}</>}
      </div>
      {vehicleLabel && (
        <div className="small">
          <Link to={`/admin/inventory/${vehicleLabel.id}`}>{vehicleTitle(vehicleLabel)}</Link>
          {vehicleLabel.status === "Sold" && lead.stage !== "Won" && <span className="muted"> (sold)</span>}
        </div>
      )}
      <div className="small">
        {unanswered ? (
          <span className="badge badge-bad">⚠ waiting {fmtMinutes(waitingFor(lead.createdAt))}</span>
        ) : lead.firstResponseMinutes !== undefined ? (
          <span className="muted">Replied in {fmtMinutes(lead.firstResponseMinutes)}</span>
        ) : null}
      </div>
      {lead.phone && (
        <a className="small ellipsis" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>
          {lead.phone}
        </a>
      )}
      {lead.email && (
        <a className="small ellipsis" href={`mailto:${lead.email}`} title={lead.email}>
          {lead.email}
        </a>
      )}
      <div className="lead-actions">
        <select aria-label="Stage" value={lead.stage} onChange={(e) => onMove(e.target.value as LeadStage)}>
          {LEAD_STAGES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Salesperson" value={lead.salespersonId ?? ""} onChange={(e) => onAssign(e.target.value || undefined)}>
          <option value="">Unassigned</option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}
