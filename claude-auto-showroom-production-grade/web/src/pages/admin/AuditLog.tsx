import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, errorText } from "../../api/client";
import { fmtDate } from "../../lib/format";

interface AuditEntry {
  id: number;
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: Record<string, unknown>;
  ip: string | null;
  userName: string | null;
}

const LABELS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.password_changed": "Changed password",
  "vehicle.create": "Added vehicle",
  "vehicle.update": "Edited vehicle",
  "vehicle.sell": "Recorded sale",
  "vehicle.reserve": "Reserved vehicle",
  "vehicle.unreserve": "Unreserved vehicle",
  "vehicle.delete": "Deleted vehicle",
  "lead.create": "New lead",
  "lead.stage": "Moved lead",
  "lead.assign": "Assigned lead",
  "user.create": "Added user",
  "user.update": "Edited user",
  "user.password_reset": "Reset password",
  "settings.site": "Changed business details",
  "branch.create": "Added showroom",
  "branch.update": "Edited showroom",
  "upload.create": "Uploaded photo",
};

function summary(e: AuditEntry): string {
  const d = e.details;
  if (e.action === "lead.stage") return `${d.from} → ${d.to}`;
  if (e.action === "vehicle.update") return Object.keys(d).join(", ");
  if (e.action === "vehicle.sell") return `${d.salePrice} on ${d.soldDate}`;
  if (e.action === "vehicle.delete" || e.action === "vehicle.create") return String(d.stockNo ?? "");
  return "";
}

/** Who did what, and when: for accountability and for tracing mistakes. */
export function AuditLog() {
  const q = useQuery({ queryKey: ["audit"], queryFn: () => api<{ items: AuditEntry[] }>("/admin/audit?limit=300") });
  return (
    <>
      <div className="page-head">
        <h1>Activity log</h1>
      </div>
      {q.isError && <div className="notice">{errorText(q.error)}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {q.isPending && (
              <tr>
                <td colSpan={4} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {q.data?.items.map((e) => (
              <tr key={e.id}>
                <td className="num">{fmtDate(e.at, true)}</td>
                <td>{e.userName ?? <span className="muted">Website visitor</span>}</td>
                <td>
                  {e.entity === "vehicle" && e.entityId && e.action !== "vehicle.delete" ? (
                    <Link to={`/admin/inventory/${e.entityId}`}>{LABELS[e.action] ?? e.action}</Link>
                  ) : (
                    (LABELS[e.action] ?? e.action)
                  )}
                </td>
                <td className="muted ellipsis" style={{ maxWidth: 360 }}>
                  {summary(e)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
