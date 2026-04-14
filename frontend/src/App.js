import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AccountProvider } from "./context/AccountContext";
import Layout from "./components/Layout";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import MagicLinkPage from "./pages/MagicLinkPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import DashboardPage from "./pages/DashboardPage";
import ImportPage from "./pages/ImportPage";
import RulesPage from "./pages/RulesPage";
import ReviewPage from "./pages/ReviewPage";
import InboxPage from "./pages/InboxPage";
import InvestmentPage from "./pages/InvestmentPage";
import SettingsPage from "./pages/SettingsPage";

/**
 * Single protected shell — AccountProvider and Layout are mounted ONCE and
 * persist across all page navigations, so selectedAccount is never reset.
 */
function ProtectedShell() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-zinc-500">
      Loading…
    </div>
  );
  if (!user) return <Navigate to="/landing" replace />;
  return (
    <AccountProvider>
      <Layout>
        <Outlet />
      </Layout>
    </AccountProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={process.env.PUBLIC_URL || ""}>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/landing"        element={<LandingPage />} />
          <Route path="/login"          element={<LoginPage />} />
          <Route path="/register"       element={<RegisterPage />} />
          <Route path="/forgot-password"element={<ForgotPasswordPage />} />
          <Route path="/magic-link"     element={<MagicLinkPage />} />
          <Route path="/verify-email"   element={<VerifyEmailPage />} />
          <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

          {/* Protected routes — single AccountProvider for all */}
          <Route element={<ProtectedShell />}>
            <Route path="/"           element={<DashboardPage />} />
            <Route path="/import"     element={<ImportPage />} />
            <Route path="/rules"      element={<RulesPage />} />
            <Route path="/review"     element={<ReviewPage />} />
            <Route path="/inbox"      element={<InboxPage />} />
            <Route path="/investment" element={<InvestmentPage />} />
            <Route path="/settings"   element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/landing" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
