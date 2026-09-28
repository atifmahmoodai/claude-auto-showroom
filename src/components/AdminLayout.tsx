import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { SITE } from "../config";
import { useStore } from "../store/store";
import { LogoMark } from "./SiteLayout";

export function AdminLayout() {
  const { data, persisted } = useStore();
  const newLeads = data.leads.filter((l) => l.stage === "New").length;
  const inStock = data.vehicles.filter((v) => v.status !== "Sold").length;

  return (
    <div className="admin-shell">
      <aside className="admin-side" aria-label="Dealer menu">
        <NavLink to="/admin" className="logo" style={{ padding: "0.2rem 0.5rem 0.8rem" }} end>
          <LogoMark />
          <span>{SITE.name}</span>
        </NavLink>
        <NavLink to="/admin" end className="side-link">
          Dashboard
        </NavLink>
        <NavLink to="/admin/inventory" className="side-link">
          Inventory <span className="badge count">{inStock}</span>
        </NavLink>
        <NavLink to="/admin/leads" className="side-link">
          Leads {newLeads > 0 && <span className="badge badge-brand count">{newLeads} new</span>}
        </NavLink>
        <NavLink to="/admin/export" className="side-link">
          Data &amp; Power BI
        </NavLink>
        <NavLink to="/" className="side-link">
          ← View website
        </NavLink>
        <div className="side-extra muted small" style={{ marginTop: "auto", padding: "0.5rem" }}>
          Demo mode: no login, data is stored in this browser only.
        </div>
      </aside>
      <main className="admin-main">
        {!persisted && (
          <div className="notice" role="alert" style={{ marginBottom: "1rem" }}>
            Your browser blocked local storage, so changes will be lost when you close this tab.
          </div>
        )}
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
