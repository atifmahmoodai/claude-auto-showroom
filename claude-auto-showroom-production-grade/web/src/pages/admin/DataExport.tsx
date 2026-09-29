import { useQuery } from "@tanstack/react-query";
import { api, errorText } from "../../api/client";
import { fmtNumber } from "../../lib/format";

interface TableInfo {
  name: string;
  description: string;
  rows: number;
}

export function DataExport() {
  const q = useQuery({ queryKey: ["export-tables"], queryFn: () => api<{ tables: TableInfo[] }>("/admin/export") });

  return (
    <>
      <div className="page-head">
        <h1>Data &amp; Power BI</h1>
      </div>

      <div className="chart-grid">
        <section className="card wide stack" style={{ gridColumn: "1 / -1" }}>
          <h2 style={{ margin: 0 }}>Export for Power BI</h2>
          <p className="muted" style={{ margin: 0 }}>
            Star-schema CSV tables built from the live database. Load them in Power BI Desktop (Get data → Text/CSV), then follow{" "}
            <code>powerbi/README.md</code> for relationships and DAX measures. Customer names, emails and phones are left out.
          </p>
          {q.isError && <div className="notice">{errorText(q.error)}</div>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Contents</th>
                  <th className="r">Rows</th>
                  <th />
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
                {q.data?.tables.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <strong>{t.name}</strong>
                    </td>
                    <td className="muted" style={{ whiteSpace: "normal" }}>
                      {t.description}
                    </td>
                    <td className="r">{fmtNumber(t.rows)}</td>
                    <td>
                      {/* A plain link: the browser downloads it with the session cookie. */}
                      <a className="btn btn-sm" href={`/api/admin/export/${encodeURIComponent(t.name)}.csv`} download>
                        Download CSV
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Live connection</h2>
          <p className="muted" style={{ margin: 0 }}>
            For scheduled refresh, connect Power BI straight to the database's read-only <code>bi</code> schema (views with no personal data). Your IT
            admin can create the reporting login; see <code>docs/POWERBI.md</code>.
          </p>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Backups</h2>
          <p className="muted" style={{ margin: 0 }}>
            All data lives in the PostgreSQL database and is backed up on the server (daily dumps plus point-in-time recovery on managed databases). See{" "}
            <code>docs/OPERATIONS.md</code>.
          </p>
        </section>
      </div>
    </>
  );
}
