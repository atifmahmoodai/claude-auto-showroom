import { EnquiryForm } from "../components/EnquiryForm";
import { BRANCHES, SITE } from "../config";

export function Contact() {
  return (
    <div className="container section">
      <h1>Contact us</h1>
      <p className="muted">Questions about a car, trade-ins or finance? Send us a message or visit a showroom.</p>
      <div className="detail-grid" style={{ marginTop: "1rem" }}>
        <div className="card">
          <EnquiryForm />
        </div>
        <div className="stack">
          {BRANCHES.map((b) => (
            <div key={b.id} className="card">
              <h2>{b.name} showroom</h2>
              <p className="muted" style={{ marginBottom: "0.4rem" }}>
                {b.address}
              </p>
              <p style={{ margin: 0 }}>
                <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>{b.phone}</a>
                <br />
                <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
              </p>
              <p className="muted small" style={{ margin: "0.4rem 0 0" }}>
                Mon–Sat 9:00–19:00 · Sun closed
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
