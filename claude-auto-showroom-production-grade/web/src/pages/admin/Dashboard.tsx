import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard, Kpi } from "../../components/ChartCard";
import { BRANCHES, branchName } from "../../config";
import { canSeeMoney, useMe } from "../../api/auth";
import { api, errorText } from "../../api/client";
import type { Dashboard as DashboardData } from "../../lib/analytics";
import { addDays, startOfMonthsAgo, todayLocal } from "../../lib/dates";
import { fmtMinutes, fmtMoney, fmtMoneyCompact, fmtNumber, fmtPercent, vehicleTitle } from "../../lib/format";

type Preset = "month" | "30d" | "3m" | "12m" | "ytd" | "all";

const PRESETS: { id: Preset; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "30d", label: "Last 30 days" },
  { id: "3m", label: "Last 3 months" },
  { id: "12m", label: "Last 12 months" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All data (24 months)" },
];

function presetRange(p: Preset, today: string): { from: string; to: string } {
  switch (p) {
    case "month":
      return { from: startOfMonthsAgo(today, 0), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "3m":
      return { from: startOfMonthsAgo(today, 2), to: today };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "all":
      return { from: startOfMonthsAgo(today, 23), to: today };
    case "12m":
    default:
      return { from: startOfMonthsAgo(today, 11), to: today };
  }
}

const axisProps = {
  stroke: "var(--chart-grid)",
  tick: { fill: "var(--chart-axis)", fontSize: 12 },
  tickLine: false,
};

const tooltipProps = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    color: "var(--text)",
    fontSize: 13,
  },
  labelStyle: { color: "var(--text)", fontWeight: 700 },
  itemStyle: { color: "var(--text-2)" },
  cursor: { fill: "var(--surface-2)", opacity: 0.6 },
};

export function Dashboard() {
  const me = useMe();
  const today = todayLocal();
  const [preset, setPreset] = useState<Preset>("12m");
  const [branchId, setBranchId] = useState("all");
  const { from, to } = presetRange(preset, today);
  const filter = { from, to, branchId };
  const q = useQuery({
    queryKey: ["dashboard", from, to, branchId],
    queryFn: () => api<DashboardData>(`/admin/dashboard?from=${from}&to=${to}&branch=${encodeURIComponent(branchId)}`),
    placeholderData: keepPreviousData,
    enabled: canSeeMoney(me.data),
  });
  // Sales staff work leads and stock; figures on revenue and margin are for managers.
  if (me.data && !canSeeMoney(me.data)) return <Navigate to="/admin/leads" replace />;
  if (q.isError) return <div className="notice">{errorText(q.error)}</div>;
  if (!q.data) return <p className="muted">Loading dashboard…</p>;
  const d = q.data;
  const k = d.kpis;
  const attainTone = k.targetAttainment >= 1 ? "badge-good" : k.targetAttainment >= 0.85 ? "badge-warn" : "badge-bad";

  return (
    <>
      <div className="page-head">
        <h1>Dealership dashboard</h1>
        <span className="spacer" />
        <Link to="/admin/export" className="btn btn-sm">
          Export for Power BI
        </Link>
      </div>

      <div className="filter-bar" role="group" aria-label="Dashboard filters">
        <label>
          Period
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Branch
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="all">All branches</option>
            {BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small" style={{ paddingBottom: "0.6rem" }}>
          {filter.from} → {filter.to}
        </span>
      </div>

      <div className="kpi-grid">
        <Kpi
          label="Units sold"
          value={fmtNumber(k.unitsSold)}
          sub={
            <>
              <span className={`badge ${attainTone}`}>{fmtPercent(k.targetAttainment, 0)}</span> of {fmtNumber(Math.round(k.targetUnits))} target
            </>
          }
        />
        <Kpi label="Revenue" value={fmtMoneyCompact(k.revenue)} sub={`${fmtMoney(k.unitsSold ? k.revenue / k.unitsSold : 0)} avg sale`} />
        <Kpi label="Gross profit" value={fmtMoneyCompact(k.grossProfit)} sub={`${fmtPercent(k.grossMargin)} margin`} />
        <Kpi label="Gross per unit" value={fmtMoney(k.avgGrossPerUnit)} sub="front-end gross (sale − cost)" />
        <Kpi label="Avg days to sell" value={k.avgDaysToSell.toFixed(0)} sub="acquired → sold" />
        <Kpi label="Lead conversion" value={fmtPercent(k.conversionRate)} sub={`${fmtNumber(k.wonLeads)} won of ${fmtNumber(k.leads)} leads`} />
        <Kpi
          label="Avg first response"
          value={fmtMinutes(k.avgResponseMinutes)}
          sub={
            k.unansweredLeads > 0 ? (
              <Link to="/admin/leads">
                <span className="badge badge-bad">⚠ {k.unansweredLeads} unanswered</span>
              </Link>
            ) : (
              <span className="badge badge-good">✓ all answered</span>
            )
          }
        />
        <Kpi
          label="Stock on hand"
          value={fmtNumber(d.stock.count)}
          sub={
            <>
              {fmtMoneyCompact(d.stock.value)} at cost ·{" "}
              {d.stock.over90 > 0 ? <span className="badge badge-warn">⚠ {d.stock.over90} over 90 days</span> : "none aged"}
            </>
          }
        />
      </div>

      <div className="chart-grid">
        <ChartCard
          wide
          title="Units sold vs target"
          subtitle="Monthly retail units; the dashed line is the monthly target"
          legend={
            <>
              <span>
                <i className="swatch" style={{ background: "var(--series-1)" }} /> Units sold
              </span>
              <span>
                <i className="swatch-line" /> Target
              </span>
            </>
          }
          table={{
            columns: [{ label: "Month" }, { label: "Units", align: "r" }, { label: "Target", align: "r" }, { label: "Revenue", align: "r" }, { label: "Gross", align: "r" }, { label: "Leads", align: "r" }],
            rows: d.monthly.map((m) => [m.label, m.units, m.target, fmtMoney(m.revenue), fmtMoney(m.gross), m.leads]),
          }}
        >
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={d.monthly} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="units" name="Units sold" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
              <Line dataKey="target" name="Target" stroke="var(--chart-ref)" strokeDasharray="5 4" strokeWidth={2} dot={false} type="stepAfter" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Gross profit by month"
          subtitle="Sale price minus acquisition cost"
          table={{ columns: [{ label: "Month" }, { label: "Gross profit", align: "r" }], rows: d.monthly.map((m) => [m.label, fmtMoney(m.gross)]) }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={d.monthly} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} axisLine={false} tickFormatter={(v: number) => fmtMoneyCompact(v)} width={56} />
              <Tooltip {...tooltipProps} cursor={{ stroke: "var(--chart-axis)" }} formatter={(v) => fmtMoney(Number(v))} />
              <Line dataKey="gross" name="Gross profit" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Lead funnel"
          subtitle="Leads created in the period that reached each stage"
          table={{
            columns: [{ label: "Stage" }, { label: "Leads", align: "r" }, { label: "% of leads", align: "r" }],
            rows: d.funnel.map((f) => [f.stage, f.count, fmtPercent(f.pctOfLeads)]),
          }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.funnel} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="stage" {...axisProps} axisLine={false} width={84} />
              <Tooltip {...tooltipProps} formatter={(v) => fmtNumber(Number(v))} />
              <Bar
                dataKey="count"
                name="Leads"
                fill="var(--series-1)"
                radius={[0, 4, 4, 0]}
                maxBarSize={26}
                label={{ position: "right", fill: "var(--text-2)", fontSize: 12, formatter: (v: unknown) => fmtNumber(Number(v)) }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Stock aging"
          subtitle="Vehicles on hand today, by days in stock"
          table={{
            columns: [{ label: "Age" }, { label: "Vehicles", align: "r" }, { label: "Value at cost", align: "r" }],
            rows: d.aging.map((a) => [a.bucket, a.count, fmtMoney(a.value)]),
          }}
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={d.aging} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="bucket" {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip {...tooltipProps} />
              <Bar
                dataKey="count"
                name="Vehicles"
                fill="var(--series-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
                label={{ position: "top", fill: "var(--text-2)", fontSize: 12 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Top makes by units sold"
          table={{
            columns: [{ label: "Make" }, { label: "Units", align: "r" }, { label: "Gross", align: "r" }],
            rows: d.byMake.map((m) => [m.name, m.units, fmtMoney(m.gross)]),
          }}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.byMake} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...axisProps} axisLine={false} width={104} />
              <Tooltip {...tooltipProps} />
              <Bar dataKey="units" name="Units" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={22} label={{ position: "right", fill: "var(--text-2)", fontSize: 12 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <section className="chart-card" aria-label="Lead sources">
          <header>
            <div>
              <h3>Lead sources</h3>
              <p className="muted small">Where leads come from and how well they convert</p>
            </div>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th className="r">Leads</th>
                  <th className="r">Won</th>
                  <th>Conversion</th>
                  <th className="r">Reply time</th>
                </tr>
              </thead>
              <tbody>
                {d.sources.map((s) => (
                  <tr key={s.source}>
                    <td>{s.source}</td>
                    <td className="r">{fmtNumber(s.leads)}</td>
                    <td className="r">{fmtNumber(s.won)}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <div className="meter" style={{ flex: 1, minWidth: 40 }}>
                          <span style={{ width: `${Math.min(100, (s.conversion / 0.3) * 100)}%` }} />
                        </div>
                        <span className="num small">{fmtPercent(s.conversion)}</span>
                      </div>
                    </td>
                    <td className="r">{fmtMinutes(s.avgResponseMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="chart-card" aria-label="Sales leaderboard">
          <header>
            <h3>Sales leaderboard</h3>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th className="r">Units</th>
                  <th className="r">Gross</th>
                  <th className="r">Gross / unit</th>
                </tr>
              </thead>
              <tbody>
                {d.salespeople.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="r">{s.units}</td>
                    <td className="r">{fmtMoney(s.gross)}</td>
                    <td className="r">{fmtMoney(s.avgGross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="chart-card" aria-label="Oldest stock">
          <header>
            <div>
              <h3>Oldest stock</h3>
              <p className="muted small">Candidates for a price review or wholesale</p>
            </div>
          </header>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Branch</th>
                  <th className="r">Days</th>
                  <th className="r">Price</th>
                </tr>
              </thead>
              <tbody>
                {d.oldestStock.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link to={`/admin/inventory/${v.id}`}>{vehicleTitle(v)}</Link>
                    </td>
                    <td>{branchName(v.branchId)}</td>
                    <td className="r">
                      {v.daysInStock > 90 ? <span className="badge badge-warn">⚠ {v.daysInStock}</span> : v.daysInStock}
                    </td>
                    <td className="r">{fmtMoney(v.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
