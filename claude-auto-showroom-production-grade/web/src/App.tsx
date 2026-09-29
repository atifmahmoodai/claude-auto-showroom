import { lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { SiteLayout } from "./components/SiteLayout";
import { Contact } from "./pages/Contact";
import { Home } from "./pages/Home";
import { Inventory } from "./pages/Inventory";
import { NotFound } from "./pages/NotFound";
import { VehicleDetail } from "./pages/VehicleDetail";

// Admin pages (and the charting library) load on demand so the public site stays light.
const Login = lazy(() => import("./pages/admin/Login").then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import("./pages/admin/Dashboard").then((m) => ({ default: m.Dashboard })));
const AdminInventory = lazy(() => import("./pages/admin/AdminInventory").then((m) => ({ default: m.AdminInventory })));
const VehicleForm = lazy(() => import("./pages/admin/VehicleForm").then((m) => ({ default: m.VehicleForm })));
const Leads = lazy(() => import("./pages/admin/Leads").then((m) => ({ default: m.Leads })));
const DataExport = lazy(() => import("./pages/admin/DataExport").then((m) => ({ default: m.DataExport })));
const Settings = lazy(() => import("./pages/admin/Settings").then((m) => ({ default: m.Settings })));
const Account = lazy(() => import("./pages/admin/Account").then((m) => ({ default: m.Account })));
const AuditLog = lazy(() => import("./pages/admin/AuditLog").then((m) => ({ default: m.AuditLog })));

function ScrollToTop() {
  const { pathname } = useLocation();
  // Block body on purpose: newer browsers return a Promise from scrollTo, and an
  // effect must return nothing or a cleanup function, or React crashes on unmount.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<SiteLayout />}>
          <Route index element={<Home />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="vehicle/:id" element={<VehicleDetail />} />
          <Route path="contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin/login" element={<Login />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="inventory/new" element={<VehicleForm />} />
          <Route path="inventory/:id" element={<VehicleForm />} />
          <Route path="leads" element={<Leads />} />
          <Route path="export" element={<DataExport />} />
          <Route path="settings" element={<Settings />} />
          <Route path="account" element={<Account />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
