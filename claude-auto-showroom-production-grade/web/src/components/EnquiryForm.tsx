import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { BRANCHES } from "../config";
import { addDays, todayLocal } from "../lib/dates";
import type { LeadType } from "../types";
import type { PublicVehicle } from "../../../shared/schemas";

interface Props {
  vehicle?: PublicVehicle;
  defaultType?: LeadType;
  /** Show the Enquiry / Test drive / Finance switcher. */
  allowTypeSwitch?: boolean;
}

interface Errors {
  name?: string;
  contact?: string;
  email?: string;
  preferredDate?: string;
  form?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEnquiry(f: { name: string; email: string; phone: string; type: LeadType; preferredDate: string }, today: string): Errors {
  const e: Errors = {};
  if (f.name.trim().length < 2) e.name = "Please enter your name.";
  if (!f.email.trim() && f.phone.replace(/\D/g, "").length < 7) e.contact = "Add an email or a phone number so we can reply.";
  if (f.email.trim() && !EMAIL_RE.test(f.email.trim())) e.email = "That email address doesn't look right.";
  if (f.type === "Test Drive") {
    if (!f.preferredDate) e.preferredDate = "Pick a date for your test drive.";
    else if (f.preferredDate < today) e.preferredDate = "Choose today or a future date.";
  }
  return e;
}

export function EnquiryForm({ vehicle, defaultType = "Enquiry", allowTypeSwitch = true }: Props) {
  const today = todayLocal();
  const [type, setType] = useState<LeadType>(defaultType);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [preferredDate, setPreferredDate] = useState(addDays(today, 1));
  const [branchId, setBranchId] = useState(vehicle?.branchId ?? BRANCHES[0]?.id ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);
  // Honeypot: hidden from people, filled in by form-spamming bots.
  const [website, setWebsite] = useState("");
  const send = useMutation({
    mutationFn: (body: object) => api("/public/leads", { method: "POST", body }),
    onSuccess: () => setSent(true),
    onError: (e) => {
      if (e instanceof ApiError && Object.keys(e.details).length) setErrors({ ...e.details, form: e.message });
      else setErrors({ form: e instanceof Error ? e.message : "Couldn't send. Please try again." });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validateEnquiry({ name, email, phone, type, preferredDate }, today);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    send.mutate({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      type,
      message: message.trim() || defaultMessage(type, vehicle),
      branchId: vehicle?.branchId ?? branchId,
      vehicleId: vehicle?.id,
      preferredDate: type === "Test Drive" ? preferredDate : undefined,
      website,
    });
  }

  if (sent) {
    return (
      <div className="notice notice-good" role="status">
        <strong>Thanks, {name.split(" ")[0]}!</strong> Your {type === "Test Drive" ? "test drive request" : "enquiry"} has been sent.
        A member of our team will contact you shortly.
        <div style={{ marginTop: "0.6rem" }}>
          <button
            className="btn btn-sm"
            onClick={() => {
              setSent(false);
              setMessage("");
            }}
          >
            Send another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {allowTypeSwitch && (
        <div className="tabs" role="tablist" aria-label="Request type">
          {(["Enquiry", "Test Drive", "Finance"] as LeadType[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => setType(t)}>
              {t === "Enquiry" ? "Ask a question" : t === "Test Drive" ? "Book test drive" : "Finance quote"}
            </button>
          ))}
        </div>
      )}
      <label>
        Full name
        <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={!!errors.name} />
        {errors.name && <div className="field-error">{errors.name}</div>}
      </label>
      <div className="two-col">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" aria-invalid={!!errors.email} />
          {errors.email && <div className="field-error">{errors.email}</div>}
        </label>
        <label>
          Phone
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </label>
      </div>
      {errors.contact && <div className="field-error">{errors.contact}</div>}
      {type === "Test Drive" && (
        <label>
          Preferred date
          <input type="date" min={today} value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} aria-invalid={!!errors.preferredDate} />
          {errors.preferredDate && <div className="field-error">{errors.preferredDate}</div>}
        </label>
      )}
      {!vehicle && (
        <label>
          Showroom
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Message <span className="muted">(optional)</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder={defaultMessage(type, vehicle)} />
      </label>
      <label className="hp" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      {errors.form && (
        <div className="field-error" role="alert">
          {errors.form}
        </div>
      )}
      <button className="btn btn-primary btn-block" type="submit" disabled={send.isPending}>
        {send.isPending ? "Sending…" : type === "Test Drive" ? "Request test drive" : type === "Finance" ? "Get finance quote" : "Send enquiry"}
      </button>
      <p className="muted small" style={{ margin: 0 }}>
        We reply within business hours. Your details are only used to answer this request.
      </p>
    </form>
  );
}

function defaultMessage(type: LeadType, v?: PublicVehicle): string {
  const car = v ? `the ${v.year} ${v.make} ${v.model} (${v.stockNo})` : "a car";
  if (type === "Test Drive") return `I'd like to test drive ${car}.`;
  if (type === "Finance") return `Please send me a finance quote for ${car}.`;
  return v ? `Is ${car} still available?` : "I'm looking for…";
}
