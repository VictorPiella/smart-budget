import React, { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAccounts } from "../context/AccountContext";
import api, { apiError } from "../api";

/* ── Micro SVG icons ────────────────────────────────────────────────────── */
const Ic = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const IC = {
  home:       "M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z M9 21V12h6v9",
  import:     "M12 16V4m0 12l-4-4m4 4l4-4M4 20h16",
  tag:        "M9.5 3H5a2 2 0 00-2 2v4.5l9.293 9.293a1 1 0 001.414 0l5.793-5.793a1 1 0 000-1.414L10 3zM6.5 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3z",
  bar:        "M3 3v18h18 M7 16l4-8 4 4 4-6",
  inbox:      "M3 8l9-5 9 5v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z M9 21V11h6v10",
  trend:      "M22 7l-9 9-4-4L3 18",
  settings:   "M12 15a3 3 0 100-6 3 3 0 000 6z M19.622 10.395l-1.097-2.65L20 6l-2-2-1.735 1.483-2.707-1.113L12.935 2h-1.954l-.623 2.37-2.707 1.113L6 4 4 6l1.453 1.789-1.08 2.657L2 11v2l2.373.554 1.08 2.657L4 18l2 2 1.735-1.483 2.707 1.113.623 2.37h1.954l.623-2.37 2.707-1.113L18 20l2-2-1.453-1.789 1.08-2.657L22 13v-2l-2.378-.605z",
  key:        "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
  logout:     "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
  chevronD:   "M6 9l6 6 6-6",
};

const NAV = [
  { to: "/dashboard",  label: "Dashboard",         icon: "home"     },
  { to: "/import",     label: "Import",             icon: "import"   },
  { to: "/rules",      label: "Rules",              icon: "tag"      },
  { to: "/review",     label: "Review",             icon: "bar"      },
  { to: "/inbox",      label: "Inbox",              icon: "inbox",   badge: true },
  { to: "/investment", label: "Investments",        icon: "trend"    },
  { to: "/settings",   label: "Settings",           icon: "settings" },
];

/* ── Reusable input style ────────────────────────────────────────────────── */
const inputCls = `
  w-full rounded-xl px-3 py-2.5 text-sm text-slate-100 placeholder-slate-600
  focus:outline-none focus:ring-1 focus:ring-cyan-400 transition-colors
`.trim();
const inputStyle = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" };

export default function Layout({ children }) {
  const { user, logout }                                               = useAuth();
  const { accounts, selectedAccount, setSelectedAccount, unmappedCount } = useAccounts();
  const navigate                                                        = useNavigate();
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm]           = useState({ current_password: "", new_password: "", confirm: "" });
  const [pwError, setPwError]         = useState("");
  const [pwSuccess, setPwSuccess]     = useState(false);
  const [pwSaving, setPwSaving]       = useState(false);
  const [userCount, setUserCount]     = useState(null);
  const [accOpen, setAccOpen]         = useState(false);

  useEffect(() => {
    api.get("/stats").then(({ data }) => setUserCount(data.user_count)).catch(() => {});
  }, []);

  const handleLogout = () => { logout(); navigate("/login"); };

  const handlePw = async (e) => {
    e.preventDefault();
    setPwError("");
    if (pwForm.new_password !== pwForm.confirm) { setPwError("Passwords don't match."); return; }
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
      setPwError(apiError(err, "Failed."));
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#040408" }}>

      {/* ════════════════════════════════════════════════════════════════
          TOP BAR
      ════════════════════════════════════════════════════════════════ */}
      <header className="shrink-0 flex items-center gap-4 px-5 h-14" style={{
        background: "#06060e",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>

        {/* Brand */}
        <div className="flex items-center gap-2.5 shrink-0 mr-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#22d3ee 0%,#0ea5e9 100%)", boxShadow: "0 0 16px rgba(34,211,238,0.35)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14v-4m0 0V8m0 4H8m4 0h4" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">SmartBudget</span>
          {userCount !== null && (
            <span className="text-[10px] text-slate-600">{userCount} users</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === "/dashboard"}
              className={({ isActive }) => [
                "relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-100 select-none whitespace-nowrap",
                isActive
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]",
              ].join(" ")}
              style={({ isActive }) => isActive ? {
                background: "linear-gradient(135deg, rgba(34,211,238,0.12) 0%, rgba(34,211,238,0.04) 100%)",
                border: "1px solid rgba(34,211,238,0.2)",
                boxShadow: "0 1px 0 rgba(34,211,238,0.3)",
              } : { border: "1px solid transparent" }}
            >
              {({ isActive }) => (<>
                <span className={isActive ? "text-cyan-400" : ""}>
                  <Ic d={IC[n.icon]} size={14} />
                </span>
                <span>{n.label}</span>
                {n.badge && unmappedCount > 0 && (
                  <span className="text-[10px] font-bold rounded-full min-w-[17px] h-[17px] flex items-center justify-center px-1 num"
                    style={{ background: "#f59e0b", color: "#000" }}>
                    {unmappedCount > 99 ? "99+" : unmappedCount}
                  </span>
                )}
              </>)}
            </NavLink>
          ))}
        </nav>

        {/* Right side: Account picker + User */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Account picker */}
          {accounts.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setAccOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm text-slate-300 transition-colors"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <span className="text-slate-600 text-[10px] font-semibold uppercase tracking-widest">Acct</span>
                <span className="max-w-[120px] truncate">{selectedAccount?.name ?? "—"}</span>
                <span className={`text-slate-600 transition-transform duration-150 ${accOpen ? "rotate-180" : ""}`}>
                  <Ic d={IC.chevronD} size={12} />
                </span>
              </button>
              {accOpen && (
                <div className="absolute top-full right-0 mt-1 w-52 rounded-xl overflow-hidden z-50"
                  style={{ background: "#111122", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 16px 40px rgba(0,0,0,0.8)" }}>
                  {accounts.map(a => (
                    <button key={a.id} onClick={() => { setSelectedAccount(a); setAccOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors hover:bg-white/[0.04] ${
                        selectedAccount?.id === a.id ? "text-cyan-400" : "text-slate-300"
                      }`}>
                      {selectedAccount?.id === a.id && (
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                      )}
                      <span className={selectedAccount?.id === a.id ? "" : "ml-3.5"}>{a.name}</span>
                      <span className="ml-auto text-xs text-slate-600 num">{a.currency}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          <div className="w-px h-5" style={{ background: "rgba(255,255,255,0.06)" }} />

          {/* User avatar + actions */}
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)" }}>
              {user?.email?.[0]?.toUpperCase() ?? "?"}
            </div>
            <span className="text-xs text-slate-600 max-w-[120px] truncate hidden sm:block">{user?.email}</span>
          </div>

          {[
            { label: "Password", icon: "key",    action: () => { setShowPwModal(true); setPwError(""); setPwSuccess(false); } },
            { label: "Logout",   icon: "logout", action: handleLogout, danger: true },
          ].map(b => (
            <button key={b.label} onClick={b.action} title={b.label}
              className={`flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                b.danger ? "text-slate-600 hover:text-red-400" : "text-slate-600 hover:text-slate-300"
              }`}
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <Ic d={IC[b.icon]} size={13} />
              <span className="hidden sm:inline">{b.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ════════════════════════════════════════════════════════════════
          MAIN
      ════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 min-w-0 overflow-y-auto p-8">
        {children}
      </main>

      {/* ════════════════════════════════════════════════════════════════
          MODAL — Change password
      ════════════════════════════════════════════════════════════════ */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowPwModal(false); }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-5"
            style={{ background: "#0d0d1a", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 30px 60px rgba(0,0,0,0.7)" }}>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)" }}>
                <span className="text-cyan-400"><Ic d={IC.key} size={15} /></span>
              </div>
              <h2 className="font-semibold text-slate-100">Change Password</h2>
            </div>

            {pwSuccess ? (
              <div className="text-center py-6 text-green-400 font-medium">Password updated!</div>
            ) : (
              <form onSubmit={handlePw} className="space-y-3">
                {[
                  ["current_password", "Current password"],
                  ["new_password",     "New password"],
                  ["confirm",          "Confirm new password"],
                ].map(([field, ph]) => (
                  <input key={field} type="password" placeholder={ph} required
                    value={pwForm[field]}
                    onChange={e => setPwForm(f => ({ ...f, [field]: e.target.value }))}
                    className={inputCls} style={inputStyle} />
                ))}
                {pwError && <p className="text-red-400 text-xs">{pwError}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={pwSaving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity"
                    style={{ background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", boxShadow: "0 0 20px rgba(34,211,238,0.2)" }}>
                    {pwSaving ? "Saving…" : "Update"}
                  </button>
                  <button type="button" onClick={() => setShowPwModal(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-200 transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Close account dropdown on outside click */}
      {accOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setAccOpen(false)} />
      )}
    </div>
  );
}
