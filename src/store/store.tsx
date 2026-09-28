import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { generateDemoData } from "../data/generate";
import { todayLocal } from "../lib/dates";
import type { Lead, LeadSource, LeadStage, LeadType, ShowroomData, Vehicle } from "../types";

const STORAGE_KEY = "apex-showroom:v1";

interface Persisted {
  version: 1;
  data: ShowroomData;
}

function isValid(x: unknown): x is Persisted {
  const p = x as Persisted;
  return !!p && p.version === 1 && Array.isArray(p.data?.vehicles) && Array.isArray(p.data?.leads);
}

function load(): ShowroomData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValid(parsed)) return parsed.data;
    }
  } catch {
    // Storage blocked or corrupt: fall through to fresh demo data.
  }
  return generateDemoData(todayLocal());
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}${rand}`;
}

export interface NewLeadInput {
  name: string;
  email: string;
  phone: string;
  message: string;
  type: LeadType;
  source?: LeadSource;
  branchId: string;
  vehicleId?: string;
  preferredDate?: string;
}

export interface SaleInput {
  salePrice: number;
  soldDate: string;
  salespersonId: string;
}

interface StoreValue {
  data: ShowroomData;
  /** False when the browser refused to save (private mode, quota). Changes then last only for this tab. */
  persisted: boolean;
  addLead(input: NewLeadInput): Lead;
  moveLead(id: string, stage: LeadStage): void;
  assignLead(id: string, salespersonId: string | undefined): void;
  saveVehicle(v: Vehicle): void;
  deleteVehicle(id: string): void;
  markSold(id: string, sale: SaleInput): void;
  resetDemo(): void;
  replaceData(d: ShowroomData): void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ShowroomData>(load);
  const [persisted, setPersisted] = useState(true);
  const first = useRef(true);

  useEffect(() => {
    // Skip the initial write when nothing has changed yet, but always save freshly generated data.
    if (first.current) {
      first.current = false;
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        setPersisted(false);
        return;
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data } satisfies Persisted));
      setPersisted(true);
    } catch {
      setPersisted(false);
    }
  }, [data]);

  const addLead = useCallback((input: NewLeadInput): Lead => {
    const now = new Date().toISOString();
    const lead: Lead = {
      id: newId("l"),
      createdAt: now,
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      message: input.message.trim(),
      type: input.type,
      source: input.source ?? "Website",
      stage: "New",
      stageHistory: [{ stage: "New", at: now }],
      branchId: input.branchId,
      vehicleId: input.vehicleId,
      preferredDate: input.preferredDate || undefined,
    };
    setData((d) => ({ ...d, leads: [...d.leads, lead] }));
    return lead;
  }, []);

  const moveLead = useCallback((id: string, stage: LeadStage) => {
    const now = new Date();
    setData((d) => ({
      ...d,
      leads: d.leads.map((l) => {
        if (l.id !== id || l.stage === stage) return l;
        const firstResponseMinutes =
          l.firstResponseMinutes ??
          (stage !== "New" ? Math.max(0, Math.round((now.getTime() - Date.parse(l.createdAt)) / 60_000)) : undefined);
        return {
          ...l,
          stage,
          firstResponseMinutes,
          stageHistory: [...l.stageHistory, { stage, at: now.toISOString() }],
        };
      }),
    }));
  }, []);

  const assignLead = useCallback((id: string, salespersonId: string | undefined) => {
    setData((d) => ({ ...d, leads: d.leads.map((l) => (l.id === id ? { ...l, salespersonId } : l)) }));
  }, []);

  const saveVehicle = useCallback((v: Vehicle) => {
    setData((d) => {
      const exists = d.vehicles.some((x) => x.id === v.id);
      return { ...d, vehicles: exists ? d.vehicles.map((x) => (x.id === v.id ? v : x)) : [...d.vehicles, v] };
    });
  }, []);

  const deleteVehicle = useCallback((id: string) => {
    setData((d) => ({
      vehicles: d.vehicles.filter((v) => v.id !== id),
      // Keep the leads but drop the dangling reference.
      leads: d.leads.map((l) => (l.vehicleId === id ? { ...l, vehicleId: undefined } : l)),
    }));
  }, []);

  const markSold = useCallback((id: string, sale: SaleInput) => {
    setData((d) => ({
      ...d,
      vehicles: d.vehicles.map((v) =>
        v.id === id
          ? { ...v, status: "Sold", soldDate: sale.soldDate, salePrice: sale.salePrice, salespersonId: sale.salespersonId, featured: false }
          : v,
      ),
    }));
  }, []);

  const resetDemo = useCallback(() => {
    setData(generateDemoData(todayLocal()));
  }, []);

  const replaceData = useCallback((d: ShowroomData) => {
    setData({ vehicles: d.vehicles, leads: d.leads });
  }, []);

  const value = useMemo<StoreValue>(
    () => ({ data, persisted, addLead, moveLead, assignLead, saveVehicle, deleteVehicle, markSold, resetDemo, replaceData }),
    [data, persisted, addLead, moveLead, assignLead, saveVehicle, deleteVehicle, markSold, resetDemo, replaceData],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export function nextStockNo(vehicles: Vehicle[]): string {
  const max = vehicles.reduce((m, v) => Math.max(m, Number(v.stockNo.replace(/\D/g, "")) || 0), 1000);
  return `AX${max + 1}`;
}
