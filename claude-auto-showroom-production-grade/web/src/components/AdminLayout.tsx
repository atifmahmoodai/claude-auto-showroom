import { Suspense } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { canSeeMoney, useAdminMeta, useLogout, useMe } from "../api/auth";
import { errorText } from "../api/client";
import { SITE } from "../config";
import { LogoMark } from "./SiteLayout";

export function AdminLayout() {
  const me = useMe();
  const location = useLocation();
  const meta = useAdminMeta(!!me.data);
  const logout = useLogout();

  if (me.isPending) return <p className="muted" style={{ padding: "2rem" }}>Loading…</p>;
  if (me.isError) return <p className="field-error" style={{ padding: "2rem" }}>{errorText(me.error)}</p>;
  if (!me.data) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (meta.isPending) return <p className="muted" style={{ padding: "2rem" }}>Loading…</p>;
  if (meta.isError) {
    return (
      <div className="container section">
        <div className="card empty">
          <h1>Couldn't load the dealer admin</h1>
          <p className="muted">{errorText(meta.error)}</p>
          <button className="btn btn-primary" onClick={() => void meta.refetch()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const user = me.data;
  const { counts } = meta.data;
  const money = canSeeMoney(user);

  return (
    <div className="admin-shell">
      <aside className="admin-side" aria-label="Dealer menu">
        <NavLink to={money ? "/admin" : "/admin/leads"} className="logo" style={{ padding: "0.2rem 0.5rem 0.8rem" }} end>
          <LogoMark />
          <span>{SITE.name}</span>
        </NavLink>
        {money && (
          <NavLink to="/admin" end className="side-link">
            Dashboard
          </NavLink>
        )}
        <NavLink to="/admin/inventory" className="side-link">
          Inventory <span className="badge count">{counts.inStock}</span>
        </NavLink>
        <NavLink to="/admin/leads" className="side-link">
          Leads {counts.newLeads > 0 && <span className="badge badge-brand count">{counts.newLeads} new</span>}
        </NavLink>
        {money && (
          <NavLink to="/admin/export" className="side-link">
            Data &amp; Power BI
          </NavLink>
        )}
        {user.role === "admin" && (
          <>
            <NavLink to="/admin/settings" className="side-link">
              Users &amp; settings
            </NavLink>
            <NavLink to="/admin/audit" className="side-link">
              Activity log
            </NavLink>
          </>
        )}
        <NavLink to="/" className="side-link">
          ← View website
        </NavLink>
        <div className="side-extra side-user small" style={{ marginTop: "auto" }}>
          <div>
            <strong>{user.name}</strong> <span className="muted">({user.role})</span>
          </div>
          <div className="row" style={{ gap: "0.4rem", marginTop: "0.4rem" }}>
            <NavLink to="/admin/account" className="btn btn-sm">
              My account
            </NavLink>
            <button className="btn btn-sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
