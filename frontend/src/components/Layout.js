import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAccounts } from "../context/AccountContext";
import api from "../api";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { accounts, selectedAccount, setSelectedAccount } = useAccounts();
  const navigate = useNavigate();
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!selectedAccount) { setUnmappedCount(0); return; }
    api
      .get(`/accounts/${selectedAccount.id}/transactions?unmapped_only=true`)
      .then(({ data }) => setUnmappedCount(data.length))
      .catch(() => setUnmappedCount(0));
  }, [selectedAccount]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.new_password !== pwForm.confirm) {
      setPwError("New passwords do not match.");
      return;
    }
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      setPwSuccess(true);
      setPwForm({ current_password: "", new_password: "", confirm: "" });
      setTimeout(() => { setShowPwModal(false); setPwSuccess(false); }, 1500);
    } catch (err) {
      setPwError(err.response?.data?.detail || "Failed to change password.");
    } finally {
      setPwSaving(false);
    }
  };

  const NAV = [
    { to: "/", label: "Dashboard" },
    { to: "/import", label: "Import" },
    { to: "/rules", label: "Rules & Categories" },
    { to: "/review", label: "Review" },
    { to: "/inbox", label: "Unmapped Inbox", badge: unmappedCount },
    { to: "/investment", label: "Investments" },
    { to: "/settings",  label: "Settings" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-6">
        <span className="text-indigo-400 font-bold text-lg tracking-tight">SmartBudget</span>

        <nav className="flex gap-1 flex-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `relative px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`
              }
            >
              {n.label}
              {n.badge > 0 && (
                <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-xs font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 leading-none">
                  {n.badge > 99 ? "99+" : n.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {accounts.length > 0 && (
          <select
            value={selectedAccount?.id || ""}
            onChange={(e) => {
              const acc = accounts.find((a) => a.id === e.target.value);
              setSelectedAccount(acc || null);
            }}
            className="bg-gray-800 border border-gray-700 text-sm text-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        )}

        <span className="text-gray-500 text-xs hidden sm:block">{user?.email}</span>
        <button
          onClick={() => { setShowPwModal(true); setPwError(""); setPwSuccess(false); }}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Password
        </button>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-400 hover:text-red-400 transition-colors"
        >
          Logout
        </button>
      </header>

      <main className="flex-1 p-6">{children}</main>

      {showPwModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold">Change Password</h2>
            {pwSuccess ? (
              <p className="text-green-400 text-sm text-center py-4">Password updated successfully!</p>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                <input
                  type="password"
                  placeholder="Current password"
                  value={pwForm.current_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={pwForm.new_password}
                  onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                {pwError && <p className="text-red-400 text-xs">{pwError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm py-2 rounded transition-colors"
                  >
                    {pwSaving ? "Saving..." : "Update Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPwModal(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
