import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AccountProvider } from "./context/AccountContext";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import MagicLinkPage from "./pages/MagicLinkPage";
import DashboardPage from "./pages/DashboardPage";
import ImportPage from "./pages/ImportPage";
import RulesPage from "./pages/RulesPage";
import ReviewPage from "./pages/ReviewPage";
import InboxPage from "./pages/InboxPage";
import InvestmentPage from "./pages/InvestmentPage";
import SettingsPage from "./pages/SettingsPage";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <AccountProvider>
      <Layout>{children}</Layout>
    </AccountProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/magic-link" element={<MagicLinkPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
          <Route path="/rules" element={<ProtectedRoute><RulesPage /></ProtectedRoute>} />
          <Route path="/review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
          <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
          <Route path="/investment" element={<ProtectedRoute><InvestmentPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
