// API contract: request schemas validated on the server (and reusable in the browser).
import { z } from "zod";
import { BODY_TYPES, CONDITIONS, FUEL_TYPES, LEAD_SOURCES, LEAD_STAGES, LEAD_TYPES, TRANSMISSIONS, VEHICLE_STATUSES, type Vehicle } from "./types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isoDay = z.string().regex(DAY, "Use YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Not a real date");
const text = (max: number) => z.string().trim().max(max);
const money = z.number().int().min(0).max(100_000_000);

export const ROLES = ["admin", "manager", "sales"] as const;
export type Role = (typeof ROLES)[number];

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export const PASSWORD_MIN = 10;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters`)
  .max(200)
  .refine((p) => /[a-zA-Z]/.test(p) && /\d/.test(p), "Use letters and at least one number");

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema });

/** Public enquiry / test-drive / finance request. `website` is a honeypot that humans never fill. */
export const publicLeadSchema = z
  .object({
    name: text(120).min(2, "Please enter your name."),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().email("That email address doesn't look right.").max(200)]).default(""),
    phone: text(40).default(""),
    message: text(2000).default(""),
    type: z.enum(LEAD_TYPES),
    branchId: text(64).min(1),
    vehicleId: text(64).optional(),
    preferredDate: isoDay.optional(),
    website: z.string().max(200).optional(),
  })
  .refine((l) => l.email !== "" || l.phone.replace(/\D/g, "").length >= 7, { message: "Add an email or a phone number so we can reply.", path: ["contact"] })
  .refine((l) => l.type !== "Test Drive" || !!l.preferredDate, { message: "Pick a date for your test drive.", path: ["preferredDate"] });

/** Staff-entered lead (walk-in, phone call…). */
export const staffLeadSchema = z
  .object({
    name: text(120).min(2),
    email: z.union([z.literal(""), z.string().trim().toLowerCase().email().max(200)]).default(""),
    phone: text(40).default(""),
    message: text(2000).default(""),
    type: z.enum(LEAD_TYPES),
    source: z.enum(LEAD_SOURCES),
    branchId: text(64).min(1),
    vehicleId: text(64).optional(),
    salespersonId: text(64).optional(),
    preferredDate: isoDay.optional(),
  })
  .refine((l) => l.email !== "" || l.phone.replace(/\D/g, "").length >= 7, { message: "Add an email or a phone number.", path: ["contact"] });

export const leadStageSchema = z.object({ stage: z.enum(LEAD_STAGES) });
export const leadAssignSchema = z.object({ salespersonId: z.string().max(64).nullable() });

export const vehicleSchema = z
  .object({
    vin: text(17).regex(/^[A-HJ-NPR-Z0-9]{0,17}$/i, "VINs use 17 letters/digits (no I, O or Q)").transform((s) => s.toUpperCase()).default(""),
    make: text(60).min(1, "Required"),
    model: text(60).min(1, "Required"),
    trim: text(60).default(""),
    year: z.number().int().min(1950),
    bodyType: z.enum(BODY_TYPES),
    fuel: z.enum(FUEL_TYPES),
    transmission: z.enum(TRANSMISSIONS),
    condition: z.enum(CONDITIONS),
    mileage: z.number().int().min(0).max(2_000_000),
    color: text(40).default(""),
    colorHex: z.string().regex(/^#[0-9a-f]{6}$/i).default("#9ca3af"),
    engine: text(60).default(""),
    seats: z.number().int().min(1).max(15),
    price: money.min(1, "Enter a price"),
    cost: money,
    branchId: text(64).min(1),
    status: z.enum(VEHICLE_STATUSES),
    acquiredDate: isoDay,
    soldDate: isoDay.nullish(),
    salePrice: money.nullish(),
    salespersonId: text(64).nullish(),
    features: z.array(text(80).min(1)).max(40).default([]),
    description: text(4000).default(""),
    featured: z.boolean().default(false),
    // Only http(s) links or files uploaded to this server; blocks javascript: and data: URLs.
    imageUrl: z
      .string()
      .trim()
      .max(500)
      .refine((s) => s === "" || /^https?:\/\/\S+$/i.test(s) || /^\/uploads\/[a-z0-9-]+\.(jpg|png|webp)$/.test(s), "Must be an http(s) link or an uploaded photo")
      .default(""),
  })
  .superRefine((v, ctx) => {
    if (v.status === "Sold") {
      if (!v.soldDate) ctx.addIssue({ code: "custom", path: ["soldDate"], message: "Required for a sold car" });
      else if (v.soldDate < v.acquiredDate) ctx.addIssue({ code: "custom", path: ["soldDate"], message: "Before the acquired date" });
      if (!v.salePrice) ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Enter the sale price" });
      if (!v.salespersonId) ctx.addIssue({ code: "custom", path: ["salespersonId"], message: "Required" });
    }
  });
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const saleSchema = z.object({ salePrice: money.min(1), soldDate: isoDay, salespersonId: text(64).min(1) });
export const reserveSchema = z.object({ reserved: z.boolean() });

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: text(120).min(2),
  role: z.enum(ROLES),
  branchId: text(64).nullable(),
  password: passwordSchema,
});
export const userUpdateSchema = z.object({
  name: text(120).min(2),
  role: z.enum(ROLES),
  branchId: text(64).nullable(),
  active: z.boolean(),
});
export const resetPasswordSchema = z.object({ password: passwordSchema });

export const branchSchema = z.object({
  name: text(80).min(1),
  city: text(80).min(1),
  phone: text(40).min(3),
  address: text(200).min(3),
  monthlyTarget: z.number().int().min(0).max(10_000),
});

export const siteSettingsSchema = z.object({
  name: text(80).min(1),
  tagline: text(200).default(""),
  email: z.string().trim().email().max(200),
  currency: z.string().regex(/^[A-Z]{3}$/),
  locale: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/),
  finance: z.object({
    aprPercent: z.number().min(0).max(60),
    termMonths: z.number().int().min(6).max(120),
    depositPercent: z.number().min(0).max(90),
  }),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

export { DEFAULT_SITE } from "./site-defaults";

export const dashboardQuerySchema = z.object({ from: isoDay, to: isoDay, branch: z.string().max(64).default("all") });

/** What the public API returns for a vehicle: no cost, sale price or staff details. */
export type PublicVehicle = Omit<Vehicle, "cost" | "salePrice" | "salespersonId" | "soldDate">;

export interface PublicSummary {
  stockCount: number;
  makes: string[];
  years: number[];
  lowestPrice: number;
  bodyCounts: Record<string, number>;
  featured: PublicVehicle[];
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  branchId: string | null;
}
