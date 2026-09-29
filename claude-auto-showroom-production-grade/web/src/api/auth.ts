import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { applyStaff } from "../config";
import type { SessionUser, SiteSettings } from "../../../shared/schemas";
import type { Branch, Salesperson } from "../types";
import { api, ApiError, setCsrfToken } from "./client";

interface MeResponse {
  user: SessionUser;
  csrfToken: string;
}

/** The signed-in staff member, or null. */
export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        const r = await api<MeResponse>("/auth/me");
        setCsrfToken(r.csrfToken);
        return r.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) => api<MeResponse>("/auth/login", { method: "POST", body: input }),
    onSuccess: (r) => {
      setCsrfToken(r.csrfToken);
      qc.setQueryData(["me"], r.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/auth/logout", { method: "POST" }),
    onSettled: () => {
      setCsrfToken("");
      qc.clear();
      qc.setQueryData(["me"], null);
    },
  });
}

export interface AdminMeta {
  user: SessionUser;
  site: SiteSettings;
  branches: Branch[];
  salespeople: Salesperson[];
  counts: { newLeads: number; inStock: number };
  today: string;
}

export function useAdminMeta(enabled: boolean) {
  return useQuery({
    queryKey: ["admin-meta"],
    enabled,
    queryFn: async () => {
      const m = await api<AdminMeta>("/admin/meta");
      applyStaff(m.salespeople);
      return m;
    },
    refetchInterval: 60_000,
  });
}

export const canSeeMoney = (u: SessionUser | null | undefined) => u?.role === "admin" || u?.role === "manager";
