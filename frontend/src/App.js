import "@/App.css";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider, useApp } from "@/context/AppContext";
import { HotkeyProvider } from "@/context/HotkeyContext";
import { QuickCreateProvider } from "@/context/QuickCreateContext";
import Layout from "@/components/Layout";
import KeepAliveRoutes from "@/components/KeepAliveRoutes";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Settings from "@/pages/Settings";

function Shell() {
  const { user, authLoading, shop } = useApp();

  // Wait until auth is resolved AND (if user is logged in) the shop profile is loaded
  if (authLoading || (user && !shop)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100">
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-900" />
          <p className="font-display font-bold text-indigo-900">DukanSaathi</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Enforce onboarding for new signups (require at least a phone number)
  if (!shop.phone) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <div className="w-full max-w-xl">
          <Settings isOnboarding={true} />
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <KeepAliveRoutes />
    </Layout>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppProvider>
          <HotkeyProvider>
            <QuickCreateProvider>
              <Shell />
              <Toaster position="top-center" richColors />
            </QuickCreateProvider>
          </HotkeyProvider>
        </AppProvider>
      </BrowserRouter>
    </div>
  );
}
