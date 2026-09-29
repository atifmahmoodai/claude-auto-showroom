import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useMe } from "../../api/auth";
import { api, ApiError, errorText } from "../../api/client";
import { applySite, BRANCHES, branchName } from "../../config";
import { ROLES, type Role, type SiteSettings } from "../../../../shared/schemas";
import type { Branch } from "../../types";

interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  branchId: string | null;
  active: boolean;
  locked: boolean;
  createdAt: string;
}

const fieldErrors = (e: unknown) => (e instanceof ApiError ? e.details : {});

export function Settings() {
  const me = useMe();
  if (me.data && me.data.role !== "admin") return <Navigate to="/admin" replace />;
  return (
    <>
      <div className="page-head">
        <h1>Users &amp; settings</h1>
      </div>
      <div className="stack">
        <Users />
        <Branches />
        <Business />
      </div>
    </>
  );
}

function Users() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["users"], queryFn: () => api<{ items: StaffUser[] }>("/admin/users") });
  const [editing, setEditing] = useState<StaffUser | "new" | null>(null);
  return (
    <section className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Staff logins</h2>
        <span className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
          + Add user
        </button>
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Admins manage users and settings. Managers see revenue, cost and reports. Sales staff work leads, reserve cars and record sales, without cost or margin.
      </p>
      {q.isError && <div className="notice">{errorText(q.error)}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {q.data?.items.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="ellipsis">{u.email}</td>
                <td>{u.role}</td>
                <td>{u.branchId ? branchName(u.branchId) : "—"}</td>
                <td>
                  {!u.active ? <span className="badge">Disabled</span> : u.locked ? <span className="badge badge-bad">Locked</span> : <span className="badge badge-good">Active</span>}
                </td>
                <td>
                  <button className="btn btn-sm" onClick={() => setEditing(u)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <UserDialog
          user={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["users"] });
            void qc.invalidateQueries({ queryKey: ["admin-meta"] });
          }}
        />
      )}
    </section>
  );
}

function UserDialog({ user, onClose, onSaved }: { user: StaffUser | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: user?.name ?? "", email: user?.email ?? "", role: user?.role ?? ("sales" as Role), branchId: user?.branchId ?? BRANCHES[0]?.id ?? "", active: user?.active ?? true, password: "" });
  const [done, setDone] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const branchId = f.branchId || null;
      if (!user) return api("/admin/users", { method: "POST", body: { email: f.email, name: f.name, role: f.role, branchId, password: f.password } });
      await api(`/admin/users/${user.id}`, { method: "PUT", body: { name: f.name, role: f.role, branchId, active: f.active } });
      if (f.password) await api(`/admin/users/${user.id}/password`, { method: "POST", body: { password: f.password } });
    },
    onSuccess: () => {
      onSaved();
      if (user && f.password) setDone("Saved. The new password is active and their other sessions were signed out.");
      else onClose();
    },
  });
  const errs = fieldErrors(save.error);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={user ? "Edit user" : "Add user"} onClick={onClose}>
      <form className="card modal stack" onClick={(e) => e.stopPropagation()} onSubmit={submit} noValidate>
        <h2 style={{ margin: 0 }}>{user ? `Edit ${user.name}` : "Add user"}</h2>
        <label>
          Name
          <input value={f.name} onChange={(e) => set("name", e.target.value)} />
          {errs.name && <div className="field-error">{errs.name}</div>}
        </label>
        <label>
          Email
          <input type="email" value={f.email} disabled={!!user} onChange={(e) => set("email", e.target.value)} />
          {errs.email && <div className="field-error">{errs.email}</div>}
        </label>
        <div className="two-col">
          <label>
            Role
            <select value={f.role} onChange={(e) => set("role", e.target.value)}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Branch
            <select value={f.branchId} onChange={(e) => set("branchId", e.target.value)}>
              <option value="">None (head office)</option>
              {BRANCHES.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {user ? "New password (leave blank to keep)" : "Password"}
          <input type="password" autoComplete="new-password" value={f.password} onChange={(e) => set("password", e.target.value)} />
          <span className="muted small">At least 10 characters with letters and a number. Share it privately; they can change it under My account.</span>
          {(errs.password || errs.newPassword) && <div className="field-error">{errs.password || errs.newPassword}</div>}
        </label>
        {user && (
          <label style={{ display: "flex", alignItems: "center" }}>
            <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} /> Active (untick when someone leaves; their history is kept)
          </label>
        )}
        {save.isError && !Object.keys(errs).length && <div className="field-error">{errorText(save.error)}</div>}
        {done && <div className="notice notice-good">{done}</div>}
        <div className="row">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Branches() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [f, setF] = useState({ name: "", city: "", phone: "", address: "", monthlyTarget: "10" });
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, monthlyTarget: Number(f.monthlyTarget) };
      return editing && editing !== "new" ? api(`/admin/branches/${editing.id}`, { method: "PUT", body }) : api("/admin/branches", { method: "POST", body });
    },
    onSuccess: async () => {
      const s = await api<{ site: SiteSettings; branches: Branch[] }>("/admin/settings");
      applySite(s.site, s.branches);
      void qc.invalidateQueries();
      setEditing(null);
    },
  });
  const errs = fieldErrors(save.error);
  const open = (b: Branch | "new") => {
    setEditing(b);
    save.reset();
    setF(b === "new" ? { name: "", city: "", phone: "", address: "", monthlyTarget: "10" } : { name: b.name, city: b.city, phone: b.phone, address: b.address, monthlyTarget: String(b.monthlyTarget) });
  };
  return (
    <section className="card stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Showrooms</h2>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => open("new")}>
          + Add showroom
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Phone</th>
              <th className="r">Monthly target</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {BRANCHES.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td className="muted">{b.address}</td>
                <td>{b.phone}</td>
                <td className="r">{b.monthlyTarget}</td>
                <td>
                  <button className="btn btn-sm" onClick={() => open(b)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {(["name", "city", "phone", "address", "monthlyTarget"] as const).map((k) => (
            <label key={k}>
              {{ name: "Name", city: "City", phone: "Phone", address: "Address", monthlyTarget: "Monthly target (units)" }[k]}
              <input value={f[k]} type={k === "monthlyTarget" ? "number" : "text"} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
              {errs[k] && <div className="field-error">{errs[k]}</div>}
            </label>
          ))}
          <div className="row span-all">
            {save.isError && !Object.keys(errs).length && <span className="field-error">{errorText(save.error)}</span>}
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={save.isPending}>
              Save showroom
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Business() {
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api<{ site: SiteSettings; branches: Branch[] }>("/admin/settings") });
  if (!q.data) return <section className="card">{q.isError ? errorText(q.error) : "Loading…"}</section>;
  return <BusinessForm key={JSON.stringify(q.data.site)} initial={q.data.site} branches={q.data.branches} />;
}

function BusinessForm({ initial, branches }: { initial: SiteSettings; branches: Branch[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: initial.name,
    tagline: initial.tagline,
    email: initial.email,
    currency: initial.currency,
    locale: initial.locale,
    apr: String(initial.finance.aprPercent),
    term: String(initial.finance.termMonths),
    deposit: String(initial.finance.depositPercent),
  });
  const save = useMutation({
    mutationFn: () =>
      api<SiteSettings>("/admin/settings/site", {
        method: "PUT",
        body: {
          name: f.name,
          tagline: f.tagline,
          email: f.email,
          currency: f.currency.trim().toUpperCase(),
          locale: f.locale.trim(),
          finance: { aprPercent: Number(f.apr), termMonths: Number(f.term), depositPercent: Number(f.deposit) },
        },
      }),
    onSuccess: (site) => {
      applySite(site, branches);
      void qc.invalidateQueries();
    },
  });
  const errs = fieldErrors(save.error);
  const input = (k: keyof typeof f, label: string, hint?: string, errKey: string = k) => (
    <label>
      {label}
      <input value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
      {hint && <span className="muted small">{hint}</span>}
      {errs[errKey] && <div className="field-error">{errs[errKey]}</div>}
    </label>
  );
  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>Business details</h2>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {input("name", "Business name")}
        {input("email", "Sales email")}
        {input("tagline", "Tagline")}
        {input("currency", "Currency", "ISO code, e.g. USD, PKR, AED")}
        {input("locale", "Number format", "e.g. en-US, en-PK, en-AE")}
        {input("apr", "Finance APR %", undefined, "finance.aprPercent")}
        {input("term", "Finance term (months)", undefined, "finance.termMonths")}
        {input("deposit", "Finance deposit %", undefined, "finance.depositPercent")}
        <div className="row span-all">
          {save.isSuccess && <span className="badge badge-good">Saved</span>}
          {save.isError && !Object.keys(errs).length && <span className="field-error">{errorText(save.error)}</span>}
          <span className="spacer" />
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            Save business details
          </button>
        </div>
      </form>
    </section>
  );
}
