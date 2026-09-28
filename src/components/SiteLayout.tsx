import { Link, NavLink, Outlet } from "react-router-dom";
import { BRANCHES, SITE } from "../config";

export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--brand)" />
      <path
        d="M12 40l5-11c1-3 4-5 7-5h16c3 0 6 2 7 5l5 11v6a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2H20v2a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"
        fill="#fff"
      />
      <circle cx="21" cy="39" r="3" fill="var(--brand)" />
      <circle cx="43" cy="39" r="3" fill="var(--brand)" />
    </svg>
  );
}

export function SiteLayout() {
  const year = new Date().getFullYear();
  return (
    <>
      <header className="site-header">
        <div className="container">
          <Link to="/" className="logo">
            <LogoMark />
            <span>{SITE.name}</span>
          </Link>
          <nav className="nav" aria-label="Main">
            <NavLink to="/" end className={({ isActive }) => `nav-home${isActive ? " active" : ""}`}>
              Home
            </NavLink>
            <NavLink to="/inventory">Inventory</NavLink>
            <NavLink to="/contact">Contact</NavLink>
            <NavLink to="/admin">Dealer login</NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <Link to="/" className="logo">
              <LogoMark />
              <span>{SITE.name}</span>
            </Link>
            <p className="muted small" style={{ marginTop: "0.6rem" }}>
              {SITE.tagline}
            </p>
          </div>
          {BRANCHES.map((b) => (
            <div key={b.id}>
              <h3>{b.name} showroom</h3>
              <p className="muted small">
                {b.address}
                <br />
                <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>{b.phone}</a>
                <br />
                Mon–Sat 9:00–19:00
              </p>
            </div>
          ))}
          <div>
            <h3>Browse</h3>
            <p className="small">
              <Link to="/inventory?cond=New">New cars</Link>
              <br />
              <Link to="/inventory?cond=Used">Used cars</Link>
              <br />
              <Link to="/inventory?fuel=Electric">Electric</Link>
            </p>
          </div>
        </div>
        <div className="container muted small" style={{ marginTop: "1rem" }}>
          © {year} {SITE.name}. Demo showroom — vehicles and prices are illustrative.
        </div>
      </footer>
    </>
  );
}
