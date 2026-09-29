import type { BodyType, FuelType } from "./types";

export interface ModelSpec {
  make: string;
  model: string;
  bodyType: BodyType;
  /** Typical new price in USD. */
  basePrice: number;
  fuels: FuelType[];
  trims: string[];
  engines: Partial<Record<FuelType, string>>;
  seats: number;
}

export const CATALOG: ModelSpec[] = [
  { make: "Toyota", model: "Corolla", bodyType: "Sedan", basePrice: 24000, fuels: ["Petrol", "Hybrid"], trims: ["LE", "SE", "XSE"], engines: { Petrol: "2.0L I4", Hybrid: "1.8L Hybrid" }, seats: 5 },
  { make: "Toyota", model: "Camry", bodyType: "Sedan", basePrice: 30000, fuels: ["Petrol", "Hybrid"], trims: ["LE", "SE", "XLE"], engines: { Petrol: "2.5L I4", Hybrid: "2.5L Hybrid" }, seats: 5 },
  { make: "Toyota", model: "RAV4", bodyType: "SUV", basePrice: 32000, fuels: ["Petrol", "Hybrid"], trims: ["LE", "XLE", "Limited"], engines: { Petrol: "2.5L I4", Hybrid: "2.5L Hybrid AWD" }, seats: 5 },
  { make: "Toyota", model: "Hilux", bodyType: "Pickup", basePrice: 38000, fuels: ["Diesel"], trims: ["SR", "SR5", "Rogue"], engines: { Diesel: "2.8L Turbo Diesel" }, seats: 5 },
  { make: "Toyota", model: "Yaris", bodyType: "Hatchback", basePrice: 19000, fuels: ["Petrol", "Hybrid"], trims: ["Ascent", "SX", "ZR"], engines: { Petrol: "1.5L I3", Hybrid: "1.5L Hybrid" }, seats: 5 },
  { make: "Honda", model: "Civic", bodyType: "Sedan", basePrice: 26000, fuels: ["Petrol"], trims: ["LX", "Sport", "EX"], engines: { Petrol: "2.0L I4" }, seats: 5 },
  { make: "Honda", model: "CR-V", bodyType: "SUV", basePrice: 33000, fuels: ["Petrol", "Hybrid"], trims: ["LX", "EX", "Touring"], engines: { Petrol: "1.5L Turbo", Hybrid: "2.0L Hybrid" }, seats: 5 },
  { make: "Honda", model: "City", bodyType: "Sedan", basePrice: 18500, fuels: ["Petrol"], trims: ["S", "V", "RS"], engines: { Petrol: "1.5L I4" }, seats: 5 },
  { make: "Hyundai", model: "Tucson", bodyType: "SUV", basePrice: 31000, fuels: ["Petrol", "Hybrid", "Diesel"], trims: ["SE", "SEL", "Limited"], engines: { Petrol: "2.5L I4", Hybrid: "1.6L Turbo Hybrid", Diesel: "2.0L CRDi" }, seats: 5 },
  { make: "Hyundai", model: "Elantra", bodyType: "Sedan", basePrice: 23000, fuels: ["Petrol", "Hybrid"], trims: ["SE", "SEL", "N Line"], engines: { Petrol: "2.0L I4", Hybrid: "1.6L Hybrid" }, seats: 5 },
  { make: "Hyundai", model: "Staria", bodyType: "Van", basePrice: 42000, fuels: ["Diesel"], trims: ["Load", "Elite"], engines: { Diesel: "2.2L CRDi" }, seats: 8 },
  { make: "Kia", model: "Sportage", bodyType: "SUV", basePrice: 30000, fuels: ["Petrol", "Hybrid"], trims: ["LX", "EX", "GT-Line"], engines: { Petrol: "2.5L I4", Hybrid: "1.6L Turbo Hybrid" }, seats: 5 },
  { make: "Kia", model: "Picanto", bodyType: "Hatchback", basePrice: 15000, fuels: ["Petrol"], trims: ["S", "GT-Line"], engines: { Petrol: "1.2L I4" }, seats: 5 },
  { make: "Kia", model: "Sorento", bodyType: "SUV", basePrice: 38000, fuels: ["Petrol", "Diesel", "Hybrid"], trims: ["LX", "EX", "SX"], engines: { Petrol: "2.5L I4", Diesel: "2.2L CRDi", Hybrid: "1.6L Turbo Hybrid" }, seats: 7 },
  { make: "Ford", model: "Ranger", bodyType: "Pickup", basePrice: 36000, fuels: ["Diesel", "Petrol"], trims: ["XL", "XLT", "Wildtrak"], engines: { Diesel: "2.0L Bi-Turbo", Petrol: "2.3L EcoBoost" }, seats: 5 },
  { make: "Ford", model: "Mustang", bodyType: "Coupe", basePrice: 42000, fuels: ["Petrol"], trims: ["GT", "GT Premium"], engines: { Petrol: "5.0L V8" }, seats: 4 },
  { make: "Ford", model: "Transit Custom", bodyType: "Van", basePrice: 40000, fuels: ["Diesel"], trims: ["Trend", "Limited"], engines: { Diesel: "2.0L EcoBlue" }, seats: 3 },
  { make: "BMW", model: "3 Series", bodyType: "Sedan", basePrice: 46000, fuels: ["Petrol", "Hybrid"], trims: ["Sport", "Luxury", "M Sport"], engines: { Petrol: "2.0L Turbo", Hybrid: "2.0L Plug-in Hybrid" }, seats: 5 },
  { make: "BMW", model: "X5", bodyType: "SUV", basePrice: 68000, fuels: ["Petrol", "Diesel", "Hybrid"], trims: ["xLine", "M Sport"], engines: { Petrol: "3.0L Turbo I6", Diesel: "3.0L Diesel I6", Hybrid: "3.0L Plug-in Hybrid" }, seats: 5 },
  { make: "BMW", model: "4 Series", bodyType: "Coupe", basePrice: 52000, fuels: ["Petrol"], trims: ["Sport", "M Sport"], engines: { Petrol: "2.0L Turbo" }, seats: 4 },
  { make: "Mercedes-Benz", model: "C-Class", bodyType: "Sedan", basePrice: 48000, fuels: ["Petrol", "Hybrid"], trims: ["Avantgarde", "AMG Line"], engines: { Petrol: "2.0L Turbo", Hybrid: "2.0L Plug-in Hybrid" }, seats: 5 },
  { make: "Mercedes-Benz", model: "GLC", bodyType: "SUV", basePrice: 56000, fuels: ["Petrol", "Diesel"], trims: ["Avantgarde", "AMG Line"], engines: { Petrol: "2.0L Turbo", Diesel: "2.0L Diesel" }, seats: 5 },
  { make: "Tesla", model: "Model 3", bodyType: "Sedan", basePrice: 42000, fuels: ["Electric"], trims: ["RWD", "Long Range", "Performance"], engines: { Electric: "Dual Motor" }, seats: 5 },
  { make: "Tesla", model: "Model Y", bodyType: "SUV", basePrice: 46000, fuels: ["Electric"], trims: ["RWD", "Long Range"], engines: { Electric: "Dual Motor AWD" }, seats: 5 },
  { make: "Nissan", model: "Leaf", bodyType: "Hatchback", basePrice: 30000, fuels: ["Electric"], trims: ["S", "SV", "SV Plus"], engines: { Electric: "40 kWh" }, seats: 5 },
  { make: "Suzuki", model: "Swift", bodyType: "Hatchback", basePrice: 17000, fuels: ["Petrol", "Hybrid"], trims: ["GL", "GLX"], engines: { Petrol: "1.2L I4", Hybrid: "1.2L Mild Hybrid" }, seats: 5 },
  { make: "Volkswagen", model: "Golf", bodyType: "Hatchback", basePrice: 29000, fuels: ["Petrol"], trims: ["Life", "Style", "GTI"], engines: { Petrol: "1.4L TSI" }, seats: 5 },
  { make: "Mazda", model: "CX-5", bodyType: "SUV", basePrice: 31000, fuels: ["Petrol"], trims: ["Sport", "Touring", "Akera"], engines: { Petrol: "2.5L I4" }, seats: 5 },
];

export const COLORS: { name: string; hex: string; weight: number }[] = [
  { name: "Pearl White", hex: "#f1f5f9", weight: 5 },
  { name: "Midnight Black", hex: "#111827", weight: 4 },
  { name: "Silver Metallic", hex: "#9ca3af", weight: 4 },
  { name: "Graphite Grey", hex: "#4b5563", weight: 3 },
  { name: "Deep Blue", hex: "#1e3a8a", weight: 2 },
  { name: "Racing Red", hex: "#b91c1c", weight: 2 },
  { name: "Forest Green", hex: "#166534", weight: 1 },
  { name: "Sand Beige", hex: "#d6c7a1", weight: 1 },
];

export const FEATURE_POOL = [
  "Apple CarPlay & Android Auto",
  "Reversing camera",
  "360° camera",
  "Adaptive cruise control",
  "Lane keep assist",
  "Blind spot monitoring",
  "Heated seats",
  "Leather upholstery",
  "Sunroof",
  "Keyless entry & start",
  "LED headlights",
  "Wireless charging",
  "Parking sensors",
  "Dual-zone climate control",
  "Alloy wheels",
  "Full service history",
];

export const FIRST_NAMES = ["Ava", "Noah", "Liam", "Emma", "Zara", "Ali", "Hana", "Ethan", "Mia", "Yusuf", "Sofia", "Daniel", "Aisha", "Leo", "Grace", "Ryan", "Fatima", "Oliver", "Chloe", "Adam", "Nora", "Samuel", "Layla", "Ben"];
export const LAST_NAMES = ["Smith", "Khan", "Garcia", "Patel", "Nguyen", "Brown", "Wilson", "Ali", "Martin", "Lee", "Hassan", "Clark", "Lopez", "Walker", "Young", "Hall", "Rahman", "King", "Scott", "Green"];
