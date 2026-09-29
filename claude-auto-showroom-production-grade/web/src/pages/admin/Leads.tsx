import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, errorText } from "../../api/client";
import { activeSalespeople, BRANCHES, SALESPEOPLE } from "../../config";
import { fmtDate, fmtMinutes, vehicleTitle } from "../../lib/format";
import { useDebounced } from "../../lib/useDebounced";
import { LEAD_SOURCES, LEAD_STAGES, LEAD_TYPES, type Lead, type LeadSource, type LeadStage, type LeadType } from "../../types";

interface VehicleLabel {
  id: string;
  year: number;
  make: string;
  model: string;
  status: string;
}
interface LeadList {
  items: Lead[];
  vehicles: Record<string, VehicleLabel>;
}

const PERIODS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 0, label: "All time" },
];
const PER_COLUMN = 40;

export function Leads() {
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  const [branch, setBranch] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get("q") ?? "");
  const search = useDebounced(q.trim());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const key = ["leads", days, branch, source, search];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<LeadList>(`/admin/leads?days=${days}&branch=${encodeURIComponent(branch)}&source=${encodeURIComponent(source)}&q=${encodeURIComponent(search)}`),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
  const vehicles = list.data?.vehicles ?? {};
  const filtered = useMemo(() => list.data?.items ?? [], [list.data]);

  // Optimistic: the card moves at once and snaps back if the server refuses.
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { stage?: LeadStage; salespersonId?: string | null } }) =>
      patch.stage !== undefined
        ? api<Lead>(`/admin/leads/${id}/stage`, { method: "PATCH", body: { stage: patch.stage } })
        : api<Lead>(`/admin/leads/${id}/assign`, { method: "PATCH", body: { salespersonId: patch.salespersonId ?? null } }),
    onMutate: async ({ id, patch }) => {
      setError("");
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<LeadList>(key);
      if (prev) {
        qc.setQueryData<LeadList>(key, {
          ...prev,
          items: prev.items.map((l) => (l.id === id ? { ...l, ...(patch.stage ? { stage: patch.stage } : {}), ...("salespersonId" in patch ? { salespersonId: patch.salespersonId ?? undefined } : {}) } : l)),
        });
      }
      return { prev };
    },
    onError: (e, _v, c) => {
      if (c?.prev) qc.setQueryData(key, c.prev);
      setError(errorText(e));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["admin-meta"] });
    },
  });

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
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
          + Add lead
        </button>
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

      {error && (
        <div className="notice" role="alert" style={{ marginBottom: "0.8rem" }}>
          {error}
        </div>
      )}
      {list.isError && <div className="notice">{errorText(list.error)}</div>}
      <p className="muted small">
        {list.isPending ? "Loading…" : `${filtered.length} leads.`} Change a lead's stage with its dropdown; moving a lead out of "New" records the first-response time. Marking a lead "Won" doesn't sell the car; record the sale from Inventory.
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
                  vehicleLabel={l.vehicleId ? vehicles[l.vehicleId] : undefined}
                  onMove={(s) => update.mutate({ id: l.id, patch: { stage: s } })}
                  onAssign={(sp) => update.mutate({ id: l.id, patch: { salespersonId: sp ?? null } })}
                />
              ))}
              {items.length > PER_COLUMN && <p className="muted small">+ {items.length - PER_COLUMN} older — narrow the filters to see them.</p>}
              {items.length === 0 && <p className="muted small" style={{ padding: "0 0.3rem" }}>No leads</p>}
            </section>
          );
        })}
      </div>
      {adding && <NewLeadDialog onClose={() => setAdding(false)} onCreated={() => void qc.invalidateQueries({ queryKey: ["leads"] })} />}
    </>
  );
}

/** Walk-ins and phone calls entered by staff. */
function NewLeadDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", type: "Enquiry" as LeadType, source: "Walk-in" as LeadSource, branchId: BRANCHES[0]?.id ?? "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useMutation({
    mutationFn: () => api("/admin/leads", { method: "POST", body: f }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
    onError: (e) => setErrors(e instanceof ApiError && Object.keys(e.details).length ? e.details : { form: errorText(e) }),
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add lead" onClick={onClose}>
      <form className="card modal stack" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <h2 style={{ margin: 0 }}>Add lead</h2>
        <label>
          Name
          <input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          {errors.name && <div className="field-error">{errors.name}</div>}
        </label>
        <div className="two-col">
          <label>
            Phone
            <input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
            {errors.email && <div className="field-error">{errors.email}</div>}
          </label>
        </div>
        {errors.contact && <div className="field-error">{errors.contact}</div>}
        <div className="two-col">
          <label>
            Source
            <select value={f.source} onChange={(e) => set("source", e.target.value)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select value={f.type} onChange={(e) => set("type", e.target.value)}>
              {LEAD_TYPES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Branch
          <select value={f.branchId} onChange={(e) => set("branchId", e.target.value)}>
            {BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <textarea value={f.message} onChange={(e) => set("message", e.target.value)} />
        </label>
        {errors.form && <div className="field-error">{errors.form}</div>}
        <div className="row">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Add lead"}
          </button>
        </div>
      </form>
    </div>
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
  const sellers = activeSalespeople(lead.branchId);
  // Keep showing a current assignee who has since left or moved branch.
  const current = SALESPEOPLE.find((s) => s.id === lead.salespersonId);
  if (current && !sellers.includes(current)) sellers.push(current);
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
