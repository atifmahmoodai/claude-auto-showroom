import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CarArt } from "../../components/CarArt";
import { canSeeMoney, useMe } from "../../api/auth";
import { api, ApiError, errorText } from "../../api/client";
import { activeSalespeople, BRANCHES, SALESPEOPLE } from "../../config";
import { todayLocal } from "../../lib/dates";
import { fmtMoney } from "../../lib/format";
import { BODY_TYPES, CONDITIONS, FUEL_TYPES, TRANSMISSIONS, type Vehicle } from "../../types";

type Draft = Record<string, string | boolean>;

function toDraft(v: Vehicle): Draft {
  return {
    vin: v.vin,
    make: v.make,
    model: v.model,
    trim: v.trim,
    year: String(v.year),
    bodyType: v.bodyType,
    fuel: v.fuel,
    transmission: v.transmission,
    condition: v.condition,
    mileage: String(v.mileage),
    color: v.color,
    colorHex: v.colorHex,
    engine: v.engine,
    seats: String(v.seats),
    price: String(v.price),
    cost: String(v.cost),
    branchId: v.branchId,
    status: v.status,
    acquiredDate: v.acquiredDate,
    soldDate: v.soldDate ?? "",
    salePrice: v.salePrice !== undefined ? String(v.salePrice) : "",
    salespersonId: v.salespersonId ?? "",
    featured: v.featured,
    imageUrl: v.imageUrl ?? "",
    description: v.description,
    features: v.features.join("\n"),
  };
}

const BLANK: Draft = {
  vin: "",
  make: "",
  model: "",
  trim: "",
  year: String(new Date().getFullYear()),
  bodyType: "Sedan",
  fuel: "Petrol",
  transmission: "Automatic",
  condition: "Used",
  mileage: "",
  color: "",
  colorHex: "#9ca3af",
  engine: "",
  seats: "5",
  price: "",
  cost: "",
  branchId: "",
  status: "Available",
  acquiredDate: todayLocal(),
  soldDate: "",
  salePrice: "",
  salespersonId: "",
  featured: false,
  imageUrl: "",
  description: "",
  features: "",
};

export function validateVehicleDraft(d: Draft, today: string): Record<string, string> {
  const e: Record<string, string> = {};
  const str = (k: string) => String(d[k] ?? "").trim();
  const num = (k: string) => (str(k) === "" ? NaN : Number(str(k)));
  const maxYear = Number(today.slice(0, 4)) + 1;
  if (!str("make")) e.make = "Required";
  if (!str("model")) e.model = "Required";
  if (!Number.isInteger(num("year")) || num("year") < 1950 || num("year") > maxYear) e.year = `1950–${maxYear}`;
  if (!(num("mileage") >= 0)) e.mileage = "Enter 0 or more";
  if (!(num("price") > 0)) e.price = "Enter a price";
  if (!(num("cost") >= 0)) e.cost = "Enter 0 or more";
  if (!Number.isInteger(num("seats")) || num("seats") < 1 || num("seats") > 15) e.seats = "1–15";
  if (!str("acquiredDate")) e.acquiredDate = "Required";
  else if (str("acquiredDate") > today) e.acquiredDate = "Can't be in the future";
  if (str("imageUrl") && !/^https?:\/\/\S+$/i.test(str("imageUrl"))) e.imageUrl = "Must start with http:// or https://";
  if (d.status === "Sold") {
    if (!str("soldDate")) e.soldDate = "Required for a sold car";
    else if (str("soldDate") < str("acquiredDate")) e.soldDate = "Before the acquired date";
    else if (str("soldDate") > today) e.soldDate = "Can't be in the future";
    if (!(num("salePrice") > 0)) e.salePrice = "Enter the sale price";
    if (!str("salespersonId")) e.salespersonId = "Required";
  }
  return e;
}

export function VehicleForm() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["admin-vehicle", id], queryFn: () => api<Vehicle>(`/admin/vehicles/${encodeURIComponent(id!)}`), enabled: !!id, staleTime: 0 });
  if (id && q.isPending) return <p className="muted">Loading…</p>;
  if (id && q.isError) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="card empty">
        <h1>{missing ? "Vehicle not found" : "Couldn't load this vehicle"}</h1>
        {!missing && <p className="muted">{errorText(q.error)}</p>}
        <Link to="/admin/inventory" className="btn">
          Back to inventory
        </Link>
      </div>
    );
  }
  // Remount per vehicle so a draft never leaks from one car into another.
  return <VehicleFormInner key={id ?? "new"} existing={id ? q.data : undefined} />;
}

function VehicleFormInner({ existing }: { existing?: Vehicle }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const me = useMe();
  const canEdit = canSeeMoney(me.data);
  const [draft, setDraft] = useState<Draft>(() => (existing ? toDraft(existing) : { ...BLANK, branchId: BRANCHES[0]?.id ?? "" }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(() => (location.state as { saved?: boolean } | null)?.saved === true);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      existing
        ? api<Vehicle>(`/admin/vehicles/${existing.id}`, { method: "PUT", body: { ...body, version: existing.version } })
        : api<Vehicle>("/admin/vehicles", { method: "POST", body }),
    onSuccess: (v) => {
      void qc.invalidateQueries({ queryKey: ["admin-vehicles"] });
      void qc.invalidateQueries({ queryKey: ["admin-meta"] });
      void qc.invalidateQueries({ queryKey: ["summary"] });
      qc.setQueryData(["admin-vehicle", v.id], v);
      setSaved(true);
      if (!existing) navigate(`/admin/inventory/${v.id}`, { replace: true, state: { saved: true } });
    },
    onError: (e) => {
      if (e instanceof ApiError) setErrors(e.details);
      setFormError(errorText(e));
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api<{ url: string }>("/admin/uploads", { method: "POST", form });
    },
    onSuccess: (r) => set("imageUrl", r.url),
  });

  const set = (k: string, v: string | boolean) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  };
  const s = (k: string) => String(draft[k] ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateVehicleDraft(draft, todayLocal());
    setErrors(errs);
    setFormError("");
    if (Object.keys(errs).length) return;
    const sold = draft.status === "Sold";
    const v = {
      vin: s("vin").trim(),
      make: s("make").trim(),
      model: s("model").trim(),
      trim: s("trim").trim(),
      year: Number(s("year")),
      bodyType: s("bodyType") as Vehicle["bodyType"],
      fuel: s("fuel") as Vehicle["fuel"],
      transmission: s("transmission") as Vehicle["transmission"],
      condition: s("condition") as Vehicle["condition"],
      mileage: Math.round(Number(s("mileage"))),
      color: s("color").trim() || "Custom",
      colorHex: s("colorHex"),
      engine: s("engine").trim() || "—",
      seats: Number(s("seats")),
      price: Math.round(Number(s("price"))),
      cost: Math.round(Number(s("cost"))),
      branchId: s("branchId"),
      status: s("status") as Vehicle["status"],
      acquiredDate: s("acquiredDate"),
      soldDate: sold ? s("soldDate") : null,
      salePrice: sold ? Math.round(Number(s("salePrice"))) : null,
      salespersonId: sold ? s("salespersonId") : null,
      featured: !sold && draft.featured === true,
      imageUrl: s("imageUrl").trim(),
      description: s("description").trim(),
      features: s("features")
        .split(/[\n,]/)
        .map((f) => f.trim())
        .filter(Boolean),
    };
    save.mutate(v);
  }

  const field = (key: string, label: string, props: Record<string, unknown> = {}, wide = false) => (
    <label className={wide ? "span-all" : undefined}>
      {label}
      <input value={s(key)} onChange={(e) => set(key, e.target.value)} aria-invalid={!!errors[key]} {...props} />
      {errors[key] && <div className="field-error">{errors[key]}</div>}
    </label>
  );
  const choice = (key: string, label: string, options: readonly string[]) => (
    <label>
      {label}
      <select value={s(key)} onChange={(e) => set(key, e.target.value)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );

  const priceN = Number(s("price"));
  const costN = Number(s("cost"));

  return (
    <>
      <div className="page-head">
        <h1>{existing ? `Edit ${existing.stockNo}` : "Add vehicle"}</h1>
        <span className="spacer" />
        {existing && existing.status !== "Sold" && (
          <Link to={`/vehicle/${existing.id}`} className="btn btn-sm">
            View on website
          </Link>
        )}
        <Link to="/admin/inventory" className="btn btn-sm">
          Back to list
        </Link>
      </div>

      <form onSubmit={submit} noValidate className="detail-grid">
        <div className="card stack">
          <h2>Vehicle</h2>
          <div className="form-grid">
            {field("make", "Make", { placeholder: "Toyota" })}
            {field("model", "Model", { placeholder: "Corolla" })}
            {field("trim", "Trim", { placeholder: "SE" })}
            {field("year", "Year", { type: "number" })}
            {choice("bodyType", "Body type", BODY_TYPES)}
            {choice("fuel", "Fuel", FUEL_TYPES)}
            {choice("transmission", "Gearbox", TRANSMISSIONS)}
            {choice("condition", "Condition", CONDITIONS)}
            {field("mileage", "Mileage", { type: "number", min: 0 })}
            {field("engine", "Engine", { placeholder: "2.0L I4" })}
            {field("seats", "Seats", { type: "number", min: 1 })}
            {field("vin", "VIN (optional)", { maxLength: 17 })}
            {field("color", "Colour name", { placeholder: "Pearl White" })}
            <label>
              Colour swatch
              <input type="color" value={s("colorHex")} onChange={(e) => set("colorHex", e.target.value)} style={{ height: 42, padding: 4 }} />
            </label>
            {field("imageUrl", "Photo URL (optional)", { placeholder: "https://… or upload below" }, true)}
            <label className="span-all">
              Upload a photo <span className="muted">(JPEG, PNG or WebP)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={!canEdit || upload.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload.mutate(f);
                  e.target.value = "";
                }}
              />
              {upload.isPending && <span className="muted small">Uploading…</span>}
              {upload.isError && <div className="field-error">{errorText(upload.error)}</div>}
            </label>
            <label className="span-all">
              Description
              <textarea value={s("description")} onChange={(e) => set("description", e.target.value)} />
            </label>
            <label className="span-all">
              Features <span className="muted">(one per line)</span>
              <textarea value={s("features")} onChange={(e) => set("features", e.target.value)} />
            </label>
          </div>
        </div>

        <div className="stack">
          <div className="card stack">
            <h2>Pricing &amp; status</h2>
            <div className="form-grid">
              {field("price", "Advertised price", { type: "number", min: 0 })}
              {canEdit && field("cost", "Acquisition cost", { type: "number", min: 0 })}
              <label>
                Branch
                <select value={s("branchId")} onChange={(e) => set("branchId", e.target.value)}>
                  {BRANCHES.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              {choice("status", "Status", ["Available", "Reserved", "Sold"])}
              {field("acquiredDate", "Acquired on", { type: "date", max: todayLocal() })}
              {draft.status === "Sold" && (
                <>
                  {field("soldDate", "Sold on", { type: "date", max: todayLocal() })}
                  {field("salePrice", "Sale price", { type: "number", min: 0 })}
                  <label>
                    Salesperson
                    <select value={s("salespersonId")} onChange={(e) => set("salespersonId", e.target.value)} aria-invalid={!!errors.salespersonId}>
                      <option value="">Choose…</option>
                      {(existing?.salespersonId ? SALESPEOPLE.filter((p) => p.active !== false || p.id === existing.salespersonId) : activeSalespeople()).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {errors.salespersonId && <div className="field-error">{errors.salespersonId}</div>}
                  </label>
                </>
              )}
            </div>
            {draft.status !== "Sold" && (
              <label style={{ display: "flex", alignItems: "center" }}>
                <input type="checkbox" checked={draft.featured === true} onChange={(e) => set("featured", e.target.checked)} /> Feature on the home page
              </label>
            )}
            {canEdit && priceN > 0 && costN >= 0 && (
              <p className="small" style={{ margin: 0 }}>
                Expected gross at list price: <strong>{fmtMoney(priceN - costN)}</strong> ({((1 - costN / priceN) * 100).toFixed(1)}%)
              </p>
            )}
          </div>
          <div className="card">
            <div className="detail-media" style={{ padding: "0.8rem" }}>
              <CarArt bodyType={s("bodyType") as Vehicle["bodyType"]} colorHex={s("colorHex")} />
            </div>
          </div>
          {!canEdit && <div className="notice">Only managers can change vehicle details. You can reserve or record a sale from the inventory list.</div>}
          {formError && Object.keys(errors).length === 0 && (
            <div className="notice" role="alert">
              {formError}
            </div>
          )}
          {Object.keys(errors).length > 0 && <div className="notice">Please fix the highlighted fields.</div>}
          {saved && !save.isPending && Object.keys(errors).length === 0 && !formError && <div className="notice notice-good">Saved.</div>}
          <button type="submit" className="btn btn-primary btn-block" disabled={!canEdit || save.isPending}>
            {save.isPending ? "Saving…" : existing ? "Save changes" : "Add to inventory"}
          </button>
        </div>
      </form>
    </>
  );
}
