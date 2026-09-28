import { Link } from "react-router-dom";
import { calcFinance } from "../lib/finance";
import { fmtMoney, fmtNumber, vehicleTitle } from "../lib/format";
import { SITE } from "../config";
import type { Vehicle } from "../types";
import { CarArt } from "./CarArt";

export function VehicleMedia({ v, className }: { v: Vehicle; className?: string }) {
  if (v.imageUrl) return <img src={v.imageUrl} alt={vehicleTitle(v)} loading="lazy" className={className} />;
  return <CarArt bodyType={v.bodyType} colorHex={v.colorHex} title={`${vehicleTitle(v)} in ${v.color}`} className={className} />;
}

export function estimateMonthly(price: number): number {
  const { aprPercent, termMonths, depositPercent } = SITE.finance;
  return calcFinance({ price, deposit: (price * depositPercent) / 100, aprPercent, termMonths }).monthly;
}

export function VehicleCard({ v }: { v: Vehicle }) {
  return (
    <Link to={`/vehicle/${v.id}`} className="vcard">
      <div className="vcard-media">
        <VehicleMedia v={v} />
        {v.status === "Reserved" ? (
          <span className="badge badge-warn">Reserved</span>
        ) : v.condition === "New" ? (
          <span className="badge badge-brand">New</span>
        ) : null}
      </div>
      <div className="vcard-body">
        <div className="vcard-title">{vehicleTitle(v)}</div>
        <div className="muted small">
          {v.trim} · {v.color}
        </div>
        <div className="spec-chips">
          <span className="badge">{fmtNumber(v.mileage)} mi</span>
          <span className="badge">{v.fuel}</span>
          <span className="badge">{v.transmission}</span>
        </div>
        <div className="row" style={{ marginTop: "0.3rem" }}>
          <span className="vcard-price">{fmtMoney(v.price)}</span>
          <span className="spacer" />
          <span className="muted small">≈ {fmtMoney(estimateMonthly(v.price))}/mo</span>
        </div>
      </div>
    </Link>
  );
}
