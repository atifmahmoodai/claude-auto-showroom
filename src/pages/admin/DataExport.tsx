import { useMemo, useRef, useState } from "react";
import { todayLocal } from "../../lib/dates";
import { fmtNumber } from "../../lib/format";
import { buildPowerBiTables, toCsv } from "../../lib/powerbi";
import { useStore } from "../../store/store";
import type { ShowroomData } from "../../types";

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function isShowroomData(x: unknown): x is ShowroomData {
  const d = x as ShowroomData;
  return (
    !!d &&
    Array.isArray(d.vehicles) &&
    Array.isArray(d.leads) &&
    d.vehicles.every(
      (v) =>
        typeof v?.id === "string" &&
        typeof v.make === "string" &&
        typeof v.model === "string" &&
        typeof v.bodyType === "string" &&
        typeof v.price === "number" &&
        typeof v.cost === "number" &&
        typeof v.acquiredDate === "string" &&
        Array.isArray(v.features),
    ) &&
    d.leads.every(
      (l) =>
        typeof l?.id === "string" &&
        typeof l.createdAt === "string" &&
        typeof l.stage === "string" &&
        Array.isArray(l.stageHistory) &&
        l.stageHistory.length > 0,
    )
  );
}

export function DataExport() {
  const { data, resetDemo, replaceData } = useStore();
  const today = todayLocal();
  const tables = useMemo(() => buildPowerBiTables(data, today), [data, today]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function restore(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isShowroomData(parsed)) throw new Error("This file isn't a showroom backup.");
      replaceData(parsed);
      setMsg({ ok: true, text: `Restored ${parsed.vehicles.length} vehicles and ${parsed.leads.length} leads.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not read that file." });
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Data &amp; Power BI</h1>
      </div>

      <div className="chart-grid">
        <section className="card wide stack" style={{ gridColumn: "1 / -1" }}>
          <h2 style={{ margin: 0 }}>Export for Power BI</h2>
          <p className="muted" style={{ margin: 0 }}>
            Star-schema CSV tables built from the live data. Load them in Power BI Desktop (Get data → Text/CSV), then follow{" "}
            <code>powerbi/README.md</code> for relationships and DAX measures. Customer names, emails and phones are left out.
          </p>
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
                {tables.map((t) => (
                  <tr key={t.name}>
                    <td>
                      <strong>{t.name}</strong>
                    </td>
                    <td className="muted" style={{ whiteSpace: "normal" }}>
                      {t.description}
                    </td>
                    <td className="r">{fmtNumber(t.rows.length)}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => download(`${t.name}.csv`, toCsv(t), "text/csv;charset=utf-8")}>
                        Download CSV
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Backup &amp; restore</h2>
          <p className="muted" style={{ margin: 0 }}>
            Everything lives in this browser. Download a backup before clearing browser data or to move to another computer.
          </p>
          <div className="row">
            <button className="btn" onClick={() => download(`showroom-backup-${today}.json`, JSON.stringify(data), "application/json")}>
              Download backup (.json)
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Restore from file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void restore(f);
                e.target.value = "";
              }}
            />
          </div>
          {msg && <div className={`notice ${msg.ok ? "notice-good" : ""}`}>{msg.text}</div>}
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0 }}>Reset demo</h2>
          <p className="muted" style={{ margin: 0 }}>
            Replace all vehicles and leads with a fresh 24-month demo dataset ending today.
          </p>
          <div>
            <button
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm("Replace all data with fresh demo data? Your changes will be lost.")) {
                  resetDemo();
                  setMsg({ ok: true, text: "Demo data regenerated." });
                }
              }}
            >
              Reset demo data
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
