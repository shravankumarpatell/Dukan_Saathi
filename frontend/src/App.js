import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider, useApp } from "@/context/AppContext";
import { ThemeProvider } from "@/context/ThemeContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import NewBill from "@/pages/NewBill";
import Customers from "@/pages/Customers";
import Returns from "@/pages/Returns";
import Chat from "@/pages/Chat";
import BulkUpload from "@/pages/BulkUpload";
import Analytics from "@/pages/Analytics";
import BillHistory from "@/pages/BillHistory";
import Settings from "@/pages/Settings";

function Shell() {
  const { user, authLoading, shop } = useApp();

  // Wait until auth is resolved AND (if user is logged in) the shop profile is loaded
  if (authLoading || (user && !shop)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-[#111113]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-900 dark:border-[#2C2C2E] dark:border-t-[#818CF8]" />
          <p className="font-display font-bold text-indigo-900 dark:text-[#F5F5F7]">DukanSaathi</p>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  // Enforce onboarding for new signups (require at least a phone number)
  if (!shop.phone) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 dark:bg-[#111113] px-4">
        <div className="w-full max-w-xl">
          <Settings isOnboarding={true} />
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/bill" element={<NewBill />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/chat" element={<Chat />} />
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
      <ThemeProvider>
        <BrowserRouter>
          <AppProvider>
            <Shell />
            <Toaster position="top-center" richColors />
          </AppProvider>
        </BrowserRouter>
      </ThemeProvider>
    </div>
  );
}
