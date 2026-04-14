import React, { useEffect, useState } from "react";
import api, { apiError } from "../api";
import { useAccounts } from "../context/AccountContext";
import { useNavigate } from "react-router-dom";

export default function DashboardPage() {
  const { accounts, selectedAccount, fetchAccounts, setSelectedAccount, fetchUnmappedCount } =
    useAccounts();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [newAccName, setNewAccName] = useState("");
  const [newAccCurrency, setNewAccCurrency] = useState("EUR");
  const [creating, setCreating] = useState(false);

  const now = new Date();
  const [summaryYear, setSummaryYear]   = useState(now.getFullYear());
  const [summaryMonth, setSummaryMonth] = useState(now.getMonth() + 1); // 1-12
  const [accError, setAccError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;
    setLoadingTxns(true);
    Promise.all([
      api.get(`/accounts/${selectedAccount.id}/transactions`),
      api.get(`/accounts/${selectedAccount.id}/categories`),
    ])
      .then(([txnRes, catRes]) => {
        setTransactions(txnRes.data);
        setCategories(catRes.data);
      })
      .catch(() => setTransactions([]))
      .finally(() => setLoadingTxns(false));
  }, [selectedAccount]);

  const handleCreateAccount = async (e) => {
    e.preventDefault();
    setAccError("");
    setCreating(true);
    try {
      await api.post("/accounts", {
        name: newAccName,
        currency: newAccCurrency,
      });
      setNewAccName("");
      await fetchAccounts();
    } catch (err) {
      setAccError(apiError(err, "Failed to create account."));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAccount = async (id) => {
    if (!window.confirm("Delete this account and all its transactions?"))
      return;
    await api.delete(`/accounts/${id}`);
    const updated = accounts.filter((a) => a.id !== id);
    if (selectedAccount?.id === id) setSelectedAccount(updated[0] || null);
    await fetchAccounts();
  };

  const [renamingAccId, setRenamingAccId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const startRenameAcc = (a, e) => {
    e.stopPropagation();
    setRenamingAccId(a.id);
    setRenameValue(a.name);
  };

  const handleSaveRename = async (accId, e) => {
    e.stopPropagation();
    if (!renameValue.trim()) return;
    setRenameSaving(true);
    try {
      await api.patch(`/accounts/${accId}`, { name: renameValue.trim() });
      setRenamingAccId(null);
      await fetchAccounts();
    } finally {
      setRenameSaving(false);
    }
  };

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    date: "",
    raw_description: "",
    amount: "",
    category_id: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditForm({
      date: t.date,
      raw_description: t.raw_description,
      amount: t.amount,
      category_id: t.category_id || "",
    });
  };

  const handleSaveEdit = async (txnId) => {
    setEditSaving(true);
    try {
      const payload = {
        date: editForm.date,
        raw_description: editForm.raw_description,
        amount: parseFloat(editForm.amount),
      };
      if (editForm.category_id) payload.category_id = editForm.category_id;
      const { data } = await api.patch(
        `/accounts/${selectedAccount.id}/transactions/${txnId}`,
        payload,
      );
      setTransactions((prev) => prev.map((t) => (t.id === txnId ? data : t)));
      setEditingId(null);
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteTxn = async (txnId) => {
    if (!window.confirm("Delete this transaction? This cannot be undone.")) return;
    await api.delete(`/accounts/${selectedAccount.id}/transactions/${txnId}`);
    setTransactions((prev) => prev.filter((t) => t.id !== txnId));
    fetchAccounts();        // refresh balance
    fetchUnmappedCount();
  };

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  // Month navigation helpers
  const prevMonth = () => {
    if (summaryMonth === 1) { setSummaryMonth(12); setSummaryYear(y => y - 1); }
    else setSummaryMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (summaryMonth === 12) { setSummaryMonth(1); setSummaryYear(y => y + 1); }
    else setSummaryMonth(m => m + 1);
  };
  const isCurrentMonth = summaryYear === now.getFullYear() && summaryMonth === now.getMonth() + 1;
  const summaryLabel = new Date(summaryYear, summaryMonth - 1, 1)
    .toLocaleString("default", { month: "long", year: "numeric" });

  const monthTxns = transactions.filter((t) => {
    const [y, m] = t.date.split("-").map(Number);
    return y === summaryYear && m === summaryMonth;
  });
  const totalIncome   = monthTxns.filter((t) => t.amount > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
  const totalExpenses = monthTxns.filter((t) => t.amount < 0).reduce((s, t) => s + parseFloat(t.amount), 0);
  const unmapped = transactions.filter((t) => !t.category_id).length;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5 p-5">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wide">
            Accounts
          </h2>
          {accounts.length === 0 && (
            <p className="text-zinc-500 text-sm mb-3">
              No accounts yet. Create one below.
            </p>
          )}
          <ul className="space-y-2 mb-4">
            {accounts.map((a) => (
              <li
                key={a.id}
                className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors ${
                  selectedAccount?.id === a.id
                    ? "border border-cyan-500/50"
                    : "border border-white/[0.05] hover:border-white/[0.10]"
                }`}
                style={selectedAccount?.id === a.id
                  ? { background: "rgba(34,211,238,0.08)" }
                  : { background: "rgba(255,255,255,0.03)" }}
                onClick={() => setSelectedAccount(a)}
              >
                {renamingAccId === a.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveRename(a.id, e);
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setRenamingAccId(null);
                      }
                    }}
                    className="flex-1 bg-zinc-700 border border-cyan-500 rounded px-2 py-0.5 text-sm focus:outline-none mr-2"
                  />
                ) : (
                  <span className="font-medium text-sm">{a.name}</span>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">{a.currency}</span>
                  <span
                    className={`text-sm font-mono ${parseFloat(a.balance) >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {parseFloat(a.balance).toFixed(2)}
                  </span>
                  {renamingAccId === a.id ? (
                    <>
                      <button
                        onClick={(e) => handleSaveRename(a.id, e)}
                        disabled={renameSaving}
                        className="text-cyan-400 hover:text-cyan-300 text-xs disabled:opacity-50 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingAccId(null);
                        }}
                        className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={(e) => startRenameAcc(a, e)}
                        className="text-zinc-600 hover:text-cyan-400 text-xs transition-colors"
                        title="Rename account"
                      >
                        ✎
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAccount(a.id);
                        }}
                        className="text-zinc-600 hover:text-red-400 text-xs transition-colors"
                        title="Delete account"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {accError && <p className="text-red-400 text-xs mb-2">{accError}</p>}
          <form onSubmit={handleCreateAccount} className="flex gap-2">
            <input
              value={newAccName}
              onChange={(e) => setNewAccName(e.target.value)}
              placeholder="Account name"
              required
              className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
            />
            <select
              value={newAccCurrency}
              onChange={(e) => setNewAccCurrency(e.target.value)}
              className="rounded px-2 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              style={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              {["EUR", "USD", "GBP", "CHF", "CAD"].map((c) => (
                <option key={c} style={{ background: "#1e1e2e" }}>{c}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creating}
              className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white text-sm px-3 py-1.5 rounded transition-colors"
            >
              Add
            </button>
          </form>
        </div>

        {selectedAccount && (
          <div className="card p-5 space-y-4">
            {/* Header + month nav */}
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
                Summary
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={prevMonth}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors text-xs">
                  ‹
                </button>
                <span className="text-sm font-medium text-slate-200 min-w-[130px] text-center">
                  {summaryLabel}
                </span>
                <button onClick={nextMonth} disabled={isCurrentMonth}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs">
                  ›
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg p-3 text-center" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <p className="text-xs text-green-400 mb-1">Income</p>
                <p className="font-mono text-green-300 font-semibold">
                  {totalIncome.toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                <p className="text-xs text-red-400 mb-1">Expenses</p>
                <p className="font-mono text-red-300 font-semibold">
                  {Math.abs(totalExpenses).toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <p className="text-xs text-yellow-400 mb-1">Unmapped</p>
                <p className="font-mono text-yellow-300 font-semibold">
                  {unmapped}
                </p>
              </div>
            </div>

            {monthTxns.length === 0 && (
              <p className="text-zinc-600 text-xs text-center">No transactions for this month.</p>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => navigate("/import")}
                className="bg-cyan-500 hover:bg-cyan-400 text-white text-sm px-3 py-1.5 rounded transition-colors"
              >
                Import Transactions
              </button>
              <button
                onClick={() => navigate("/inbox")}
                className="bg-yellow-700 hover:bg-yellow-600 text-white text-sm px-3 py-1.5 rounded transition-colors"
              >
                View Inbox ({unmapped})
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedAccount && (
        <div className="card p-5 p-5">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">
            Recent Transactions — {selectedAccount.name}
          </h2>
          {loadingTxns ? (
            <p className="text-zinc-500 text-sm">Loading...</p>
          ) : transactions.length === 0 ? (
            <p className="text-zinc-500 text-sm">
              No transactions yet. Import a CSV to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-zinc-400 text-xs uppercase border-b border-white/[0.06]">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Description</th>
                    <th className="text-right py-2 pr-4">Amount</th>
                    <th className="text-left py-2 pr-4">Category</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.slice(0, 20).map((t) => {
                    const isEditing = editingId === t.id;
                    return (
                      <tr
                        key={t.id}
                        className={`border-b border-white/[0.05] ${isEditing ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"}`}
                      >
                        {isEditing ? (
                          <>
                            <td className="py-1.5 pr-3">
                              <input
                                type="date"
                                value={editForm.date}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    date: e.target.value,
                                  }))
                                }
                                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400 w-32"
                              />
                            </td>
                            <td className="py-1.5 pr-3">
                              <input
                                value={editForm.raw_description}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    raw_description: e.target.value,
                                  }))
                                }
                                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400 w-full min-w-[180px]"
                              />
                            </td>
                            <td className="py-1.5 pr-3 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={editForm.amount}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    amount: e.target.value,
                                  }))
                                }
                                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400 w-28 text-right"
                              />
                            </td>
                            <td className="py-1.5 pr-3">
                              <select
                                value={editForm.category_id}
                                onChange={(e) =>
                                  setEditForm((f) => ({
                                    ...f,
                                    category_id: e.target.value,
                                  }))
                                }
                                className="rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                                style={{ background: "#1e1e2e", border: "1px solid rgba(255,255,255,0.12)" }}
                              >
                                <option value="">— unmapped —</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1.5 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleSaveEdit(t.id)}
                                disabled={editSaving}
                                className="text-cyan-400 hover:text-cyan-300 text-xs mr-2 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-zinc-500 hover:text-zinc-300 text-xs mr-2"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleDeleteTxn(t.id)}
                                className="text-red-600 hover:text-red-400 text-xs"
                                title="Delete transaction"
                              >
                                Delete
                              </button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2 pr-4 text-zinc-400 whitespace-nowrap">
                              {t.date}
                            </td>
                            <td className="py-2 pr-4 max-w-xs truncate">
                              {t.raw_description}
                            </td>
                            <td
                              className={`py-2 pr-4 text-right font-mono ${parseFloat(t.amount) >= 0 ? "text-green-400" : "text-red-400"}`}
                            >
                              {parseFloat(t.amount).toFixed(2)}
                            </td>
                            <td className="py-2 pr-4">
                              <div className="flex items-center gap-1 flex-wrap">
                                {t.category_id ? (
                                  (() => {
                                    const cat = catMap[t.category_id];
                                    return cat ? (
                                      <span
                                        className="text-xs px-2 py-0.5 rounded font-medium"
                                        style={{
                                          backgroundColor: `${cat.color}30`,
                                          color: cat.color,
                                          border: `1px solid ${cat.color}60`,
                                        }}
                                      >
                                        {cat.name}
                                      </span>
                                    ) : (
                                      <span className="bg-violet-900/50 text-cyan-300 text-xs px-2 py-0.5 rounded">
                                        mapped
                                      </span>
                                    );
                                  })()
                                ) : (
                                  <span className="bg-yellow-900/50 text-yellow-300 text-xs px-2 py-0.5 rounded">
                                    unmapped
                                  </span>
                                )}
                                {t.is_manual && (
                                  <span
                                    className="text-xs text-zinc-500 bg-white/[0.04] border border-white/[0.07] px-1 py-0.5 rounded"
                                    title="Manually assigned — protected from auto-remap"
                                  >
                                    M
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2 text-right">
                              <button
                                onClick={() => startEdit(t)}
                                className="text-zinc-600 hover:text-cyan-400 text-xs transition-colors"
                              >
                                ✎
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {transactions.length > 20 && (
                <p className="text-zinc-500 text-xs mt-2">
                  Showing 20 of {transactions.length} transactions.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
