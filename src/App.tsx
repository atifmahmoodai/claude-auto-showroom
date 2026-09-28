import { lazy, useEffect } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminLayout } from "./components/AdminLayout";
import { SiteLayout } from "./components/SiteLayout";
import { Contact } from "./pages/Contact";
import { Home } from "./pages/Home";
import { Inventory } from "./pages/Inventory";
import { NotFound } from "./pages/NotFound";
import { VehicleDetail } from "./pages/VehicleDetail";
import { StoreProvider } from "./store/store";

// Admin pages (and the charting library) load on demand so the public site stays light.
const Dashboard = lazy(() => import("./pages/admin/Dashboard").then((m) => ({ default: m.Dashboard })));
const AdminInventory = lazy(() => import("./pages/admin/AdminInventory").then((m) => ({ default: m.AdminInventory })));
const VehicleForm = lazy(() => import("./pages/admin/VehicleForm").then((m) => ({ default: m.VehicleForm })));
const Leads = lazy(() => import("./pages/admin/Leads").then((m) => ({ default: m.Leads })));
const DataExport = lazy(() => import("./pages/admin/DataExport").then((m) => ({ default: m.DataExport })));

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

// HashRouter keeps deep links working on static hosts such as GitHub Pages.
export function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <ScrollToTop />
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="vehicle/:id" element={<VehicleDetail />} />
            <Route path="contact" element={<Contact />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="inventory/new" element={<VehicleForm />} />
            <Route path="inventory/:id" element={<VehicleForm />} />
            <Route path="leads" element={<Leads />} />
            <Route path="export" element={<DataExport />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </StoreProvider>
  );
}
