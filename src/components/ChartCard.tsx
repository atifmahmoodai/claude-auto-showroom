import { useState, type ReactNode } from "react";

export interface TableSpec {
  columns: { label: string; align?: "r" }[];
  rows: (string | number)[][];
}

interface Props {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  table?: TableSpec;
  wide?: boolean;
  children: ReactNode;
}

/** Chart container with a "table view" twin so values are never tooltip-only. */
export function ChartCard({ title, subtitle, legend, table, wide, children }: Props) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`chart-card ${wide ? "wide" : ""}`} aria-label={title}>
      <header>
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <span className="spacer" />
        {table && (
          <button className="btn btn-sm" onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
            {asTable ? "Chart" : "Table"}
          </button>
        )}
      </header>
      {asTable && table ? (
        <div className="table-wrap" style={{ maxHeight: 280 }}>
          <table>
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c.label} className={c.align}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) => (
                    <td key={j} className={table.columns[j]?.align}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {legend && <div className="legend">{legend}</div>}
          {children}
        </>
      )}
    </section>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className={`kpi-sub ${tone ? `tone-${tone}` : ""}`}>{sub}</div>}
    </div>
  );
}
