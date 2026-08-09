import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider, useApp } from "@/context/AppContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import NewBill from "@/pages/NewBill";
import Customers from "@/pages/Customers";
import Returns from "@/pages/Returns";
import BulkUpload from "@/pages/BulkUpload";
import Analytics from "@/pages/Analytics";
import BillHistory from "@/pages/BillHistory";
import Settings from "@/pages/Settings";

function Shell() {
  const { user, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-900" />
          <p className="font-display font-bold text-indigo-900">DukanSaathi</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/bill" element={<NewBill />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/bulk" element={<BulkUpload />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/history" element={<BillHistory />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppProvider>
          <Shell />
          <Toaster position="top-center" richColors />
        </AppProvider>
      </BrowserRouter>
    </div>
  );
}
