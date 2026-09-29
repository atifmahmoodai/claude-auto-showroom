export const BODY_TYPES = ["Sedan", "SUV", "Hatchback", "Pickup", "Coupe", "Van"] as const;
export const FUEL_TYPES = ["Petrol", "Diesel", "Hybrid", "Electric"] as const;
export const TRANSMISSIONS = ["Automatic", "Manual"] as const;
export const CONDITIONS = ["New", "Used"] as const;
export const VEHICLE_STATUSES = ["Available", "Reserved", "Sold"] as const;
export const LEAD_STAGES = ["New", "Contacted", "Test Drive", "Negotiation", "Won", "Lost"] as const;
export const LEAD_SOURCES = ["Website", "Walk-in", "Phone", "Facebook", "Marketplace", "Referral"] as const;
export const LEAD_TYPES = ["Enquiry", "Test Drive", "Finance"] as const;

export type BodyType = (typeof BODY_TYPES)[number];
export type FuelType = (typeof FUEL_TYPES)[number];
export type Transmission = (typeof TRANSMISSIONS)[number];
export type Condition = (typeof CONDITIONS)[number];
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];
export type LeadStage = (typeof LEAD_STAGES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadType = (typeof LEAD_TYPES)[number];

/** Pipeline stages in order, excluding the terminal "Lost" stage. */
export const FUNNEL_STAGES: LeadStage[] = ["New", "Contacted", "Test Drive", "Negotiation", "Won"];

export interface Branch {
  id: string;
  name: string;
  city: string;
  phone: string;
  address: string;
  /** Monthly units-sold target. */
  monthlyTarget: number;
}

export interface Salesperson {
  id: string;
  name: string;
  branchId: string;
  /** False for staff who have left; kept so their past sales still report. */
  active?: boolean;
}

export interface Vehicle {
  id: string;
  stockNo: string;
  vin: string;
  make: string;
  model: string;
  trim: string;
  year: number;
  bodyType: BodyType;
  fuel: FuelType;
  transmission: Transmission;
  condition: Condition;
  mileage: number;
  color: string;
  colorHex: string;
  engine: string;
  seats: number;
  /** Advertised price. */
  price: number;
  /** Acquisition cost. Admin-only, used for gross profit. */
  cost: number;
  branchId: string;
  status: VehicleStatus;
  /** YYYY-MM-DD the vehicle entered stock. */
  acquiredDate: string;
  /** YYYY-MM-DD, set when status is Sold. */
  soldDate?: string;
  salePrice?: number;
  salespersonId?: string;
  features: string[];
  description: string;
  featured: boolean;
  /** Optional real photo URL; an illustration is shown when absent. */
  imageUrl?: string;
  /** Row version for optimistic locking (server-managed). */
  version?: number;
}

export interface StageEvent {
  stage: LeadStage;
  /** ISO datetime. */
  at: string;
}

export interface Lead {
  id: string;
  /** ISO datetime. */
  createdAt: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  type: LeadType;
  source: LeadSource;
  stage: LeadStage;
  stageHistory: StageEvent[];
  branchId: string;
  vehicleId?: string;
  salespersonId?: string;
  /** Minutes until the first reply. Undefined while the lead is untouched. */
  firstResponseMinutes?: number;
  /** YYYY-MM-DD requested for a test drive. */
  preferredDate?: string;
}

export interface ShowroomData {
  vehicles: Vehicle[];
  leads: Lead[];
}

/** The dealership's own structure: loaded from the database in production. */
export interface Org {
  branches: Branch[];
  salespeople: Salesperson[];
}
