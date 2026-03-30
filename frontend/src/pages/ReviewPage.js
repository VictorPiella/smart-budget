import React, { useCallback, useEffect, useState } from "react";
import api from "../api";
import { useAccounts } from "../context/AccountContext";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const MONTHS    = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const PER_PAGE  = 50;
const THIS_YEAR  = new Date().getFullYear();
const THIS_MONTH = new Date().getMonth() + 1;

export default function ReviewPage() {
  const { selectedAccount, fetchUnmappedCount } = useAccounts();

  // ── Navigation state ────────────────────────────────────────────────────
  const [view,  setView]  = useState("yearly");
  const [year,  setYear]  = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // ── Data state ───────────────────────────────────────────────────────────
  const [categories,   setCategories]   = useState([]);
  const [summaryData,  setSummaryData]  = useState(null);   // yearly summary from /summary
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);     // monthly paginated list
  const [loading,      setLoading]      = useState(false);

  // ── Pagination state (monthly view) ─────────────────────────────────────
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // ── Inline edit state (monthly view) ────────────────────────────────────
  const [editingId,  setEditingId]  = useState(null);
  const [editForm,   setEditForm]   = useState({ date: "", raw_description: "", amount: "", category_id: "" });
  const [editSaving, setEditSaving] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  // ── Effect 1: fetch categories (for inline edit dropdown) ───────────────
  useEffect(() => {
    if (!selectedAccount) return;
    api.get(`/accounts/${selectedAccount.id}/categories`)
      .then(({ data }) => setCategories(data));
  }, [selectedAccount]);

  // ── Effect 2: fetch yearly summary (chart + pivot) ───────────────────────
  // Runs whenever account or year changes regardless of view — the chart
  // always shows the full year even in monthly view.
  useEffect(() => {
    if (!selectedAccount) return;
    setSummaryData(null);
    setSummaryLoading(true);
    api.get(`/accounts/${selectedAccount.id}/summary`, { params: { year } })
      .then(({ data }) => setSummaryData(data))
      .catch(() => setSummaryData(null))
      .finally(() => setSummaryLoading(false));
  }, [selectedAccount, year]);

  // ── Effect 3: fetch monthly transactions (paginated) ─────────────────────
  useEffect(() => {
    if (!selectedAccount || view !== "monthly") return;
    setLoading(true);
    api.get(`/accounts/${selectedAccount.id}/transactions`, {
      params: { year, month, page, per_page: PER_PAGE },
    })
      .then((response) => {
        setTransactions(response.data);
        setTotalPages(parseInt(response.headers["x-total-pages"] || "1", 10));
        setTotalCount(parseInt(response.headers["x-total-count"]  || "0", 10));
      })
      .catch(() => { setTransactions([]); setTotalPages(1); setTotalCount(0); })
      .finally(() => setLoading(false));
  }, [selectedAccount, view, year, month, page]);

  // ── Reset page when navigation changes ──────────────────────────────────
  useEffect(() => { setPage(1); }, [selectedAccount, year, month, view]);

  // ── Navigation helpers ───────────────────────────────────────────────────
  const prevYear = () => setYear((y) => y - 1);
  const nextYear = () => { if (year < THIS_YEAR) setYear((y) => y + 1); };
  const canGoNextYear = year < THIS_YEAR;

  const prevMonth = () => {
    setPage(1);
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const canGoNextMonth = !(year === THIS_YEAR && month >= THIS_MONTH);
  const nextMonth = () => {
    if (!canGoNextMonth) return;
    setPage(1);
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const jumpToMonth = (monthIndex) => {
    setPage(1);
    setMonth(monthIndex + 1);
    setView("monthly");
  };

  // ── Inline edit handlers ─────────────────────────────────────────────────
  const startEdit = (t) => {
    setEditingId(t.id);
    setEditForm({ date: t.date, raw_description: t.raw_description, amount: t.amount, category_id: t.category_id || "" });
  };

  const handleSaveEdit = useCallback(async (txnId) => {
    setEditSaving(true);
    try {
      const payload = {
        date:            editForm.date,
        raw_description: editForm.raw_description,
        amount:          parseFloat(editForm.amount),
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
  }, [editForm, selectedAccount]);

  const handleDeleteTxn = useCallback(async (txnId) => {
    if (!window.confirm("Delete this transaction? This cannot be undone.")) return;
    await api.delete(`/accounts/${selectedAccount.id}/transactions/${txnId}`);
    setTransactions((prev) => prev.filter((t) => t.id !== txnId));
    fetchUnmappedCount();
  }, [selectedAccount, fetchUnmappedCount]);

  // ── Chart data (from summary) ────────────────────────────────────────────
  const monthlyChartData = summaryData
    ? summaryData.monthly_chart.map((item, i) => ({
        month:    MONTHS[i],
        income:   item.income,
        expenses: item.expenses,
        savings:  Math.round((item.income - item.expenses) * 100) / 100,
      }))
    : MONTHS.map((m) => ({ month: m, income: 0, expenses: 0, savings: 0 }));

  // ── Pivot rows (from summary) ────────────────────────────────────────────
  const pivotRows = summaryData?.pivot ?? [];

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!selectedAccount) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Review</h1>
        <p className="text-gray-500">Select or create an account first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* ── Header + navigation controls ─────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Review — {selectedAccount.name}</h1>
        <div className="flex gap-2 items-center flex-wrap">

          {/* View toggle */}
          <div className="flex gap-1">
            {["monthly", "yearly"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors capitalize ${
                  view === v ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Year navigation */}
          <div className="flex items-center gap-1">
            <button onClick={prevYear} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1.5 rounded text-sm transition-colors">←</button>
            <span className="bg-gray-800 text-white px-3 py-1.5 rounded text-sm font-mono min-w-[3.5rem] text-center">{year}</span>
            <button
              onClick={nextYear}
              disabled={!canGoNextYear}
              className={`px-2 py-1.5 rounded text-sm transition-colors ${
                canGoNextYear ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-800/40 text-gray-700 cursor-not-allowed"
              }`}
            >→</button>
          </div>

          {/* Month navigation (monthly view only) */}
          {view === "monthly" && (
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1.5 rounded text-sm transition-colors">←</button>
              <span className="bg-gray-800 text-white px-3 py-1.5 rounded text-sm min-w-[3rem] text-center">{MONTHS[month - 1]}</span>
              <button
                onClick={nextMonth}
                disabled={!canGoNextMonth}
                className={`px-2 py-1.5 rounded text-sm transition-colors ${
                  canGoNextMonth ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-800/40 text-gray-700 cursor-not-allowed"
                }`}
              >→</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Income vs Expenses chart (always shown for the selected year) ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
          Income vs Expenses — {year}
          {summaryLoading && <span className="ml-2 text-gray-600 font-normal normal-case">loading…</span>}
        </h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 12 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
            <Legend />
            <Line type="monotone" dataKey="income"   stroke="#34d399" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="expenses" stroke="#f87171" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="savings"  stroke="#818cf8" strokeWidth={2} dot={false} strokeDasharray="5 3" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Yearly pivot table ───────────────────────────────────────────── */}
      {view === "yearly" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 overflow-x-auto">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Category Pivot — {year}
          </h2>

          {summaryLoading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : pivotRows.length === 0 ? (
            <p className="text-gray-500 text-sm">No data for {year}.</p>
          ) : (
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="text-gray-400 text-xs uppercase border-b border-gray-800">
                  <th className="text-left py-2 pr-4">Category</th>
                  {MONTHS.map((m, i) => (
                    <th key={m} className="text-right py-2 px-2">
                      <button
                        onClick={() => jumpToMonth(i)}
                        className="hover:text-indigo-400 transition-colors"
                        title={`View ${m} ${year}`}
                      >
                        {m}
                      </button>
                    </th>
                  ))}
                  <th className="text-right py-2 pl-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {pivotRows.map((row) => (
                  <tr
                    key={row.category_name}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${row.exclude_from_totals ? "opacity-50" : ""}`}
                  >
                    <td className="py-2 pr-4 font-medium whitespace-nowrap" style={{ color: row.exclude_from_totals ? "#9ca3af" : row.category_color }}>
                      {row.category_name}
                      {row.exclude_from_totals && (
                        <span className="ml-2 text-[10px] font-normal text-amber-500 bg-amber-900/30 px-1.5 py-0.5 rounded align-middle">excluded</span>
                      )}
                    </td>
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map((m, i) => {
                      const v = row.monthly_totals[m] ?? 0;
                      return (
                        <td
                          key={m}
                          className={`py-2 px-2 text-right font-mono text-xs rounded ${
                            v !== 0 && !row.exclude_from_totals ? "cursor-pointer hover:bg-gray-700/50" : ""
                          } ${row.exclude_from_totals ? "text-gray-600" : v < 0 ? "text-red-400" : v > 0 ? "text-green-400" : "text-gray-600"}`}
                          onClick={() => v !== 0 && !row.exclude_from_totals && jumpToMonth(i)}
                          title={v !== 0 && !row.exclude_from_totals ? `View ${MONTHS[i]} ${year}` : undefined}
                        >
                          {v !== 0 ? v.toFixed(0) : "—"}
                        </td>
                      );
                    })}
                    <td className={`py-2 pl-4 text-right font-mono font-semibold ${
                      row.exclude_from_totals ? "text-gray-600" : row.yearly_total < 0 ? "text-red-400" : "text-green-400"
                    }`}>
                      {row.yearly_total.toFixed(2)}
                    </td>
                  </tr>
                ))}

                {/* ── Savings summary row ── income − expenses per month ── */}
                {summaryData && (() => {
                  const savings = summaryData.monthly_chart.map(
                    (item) => Math.round((item.income - item.expenses) * 100) / 100
                  );
                  const total = Math.round(savings.reduce((a, b) => a + b, 0) * 100) / 100;
                  return (
                    <tr className="border-t-2 border-gray-600 bg-gray-800/40 font-semibold">
                      <td className="py-2.5 pr-4 text-indigo-300 text-sm tracking-wide">
                        Savings
                      </td>
                      {savings.map((v, i) => (
                        <td
                          key={i}
                          className={`py-2.5 px-2 text-right font-mono text-xs cursor-pointer hover:bg-gray-700/50 rounded ${
                            v < 0 ? "text-red-400" : v > 0 ? "text-green-400" : "text-gray-600"
                          }`}
                          onClick={() => jumpToMonth(i)}
                          title={`View ${MONTHS[i]} ${year}`}
                        >
                          {v !== 0 ? v.toFixed(0) : "—"}
                        </td>
                      ))}
                      <td className={`py-2.5 pl-4 text-right font-mono font-bold ${
                        total < 0 ? "text-red-400" : "text-green-400"
                      }`}>
                        {total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Monthly transactions table with inline editing + pagination ───── */}
      {view === "monthly" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Transactions — {MONTHS[month - 1]} {year}
            </h2>
            {totalCount > 0 && (
              <span className="text-xs text-gray-500">
                {totalCount} transaction{totalCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : transactions.length === 0 ? (
            <p className="text-gray-500 text-sm">No transactions for this period.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase border-b border-gray-800">
                      <th className="text-left py-2 pr-4">Date</th>
                      <th className="text-left py-2 pr-4">Description</th>
                      <th className="text-right py-2 pr-4">Amount</th>
                      <th className="text-left py-2 pr-4">Category</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const isEditing = editingId === t.id;
                      return (
                        <tr
                          key={t.id}
                          className={`border-b border-gray-800/50 ${
                            isEditing
                              ? "bg-gray-800/60"
                              : !t.category_id
                              ? "bg-yellow-900/10 hover:bg-gray-800/30"
                              : "hover:bg-gray-800/30"
                          }`}
                        >
                          {isEditing ? (
                            <>
                              <td className="py-1.5 pr-3">
                                <input
                                  type="date"
                                  value={editForm.date}
                                  onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
                                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 w-32"
                                />
                              </td>
                              <td className="py-1.5 pr-3">
                                <input
                                  value={editForm.raw_description}
                                  onChange={(e) => setEditForm((f) => ({ ...f, raw_description: e.target.value }))}
                                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full min-w-[180px]"
                                />
                              </td>
                              <td className="py-1.5 pr-3 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editForm.amount}
                                  onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
                                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 w-28 text-right"
                                />
                              </td>
                              <td className="py-1.5 pr-3">
                                <select
                                  value={editForm.category_id}
                                  onChange={(e) => setEditForm((f) => ({ ...f, category_id: e.target.value }))}
                                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                  <option value="">— unmapped —</option>
                                  {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-1.5 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleSaveEdit(t.id)}
                                  disabled={editSaving}
                                  className="text-indigo-400 hover:text-indigo-300 text-xs mr-2 disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="text-gray-500 hover:text-gray-300 text-xs mr-2"
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
                              <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">{t.date}</td>
                              <td className="py-2 pr-4 max-w-xs truncate">{t.raw_description}</td>
                              <td className={`py-2 pr-4 text-right font-mono ${parseFloat(t.amount) >= 0 ? "text-green-400" : "text-red-400"}`}>
                                {parseFloat(t.amount).toFixed(2)}
                              </td>
                              <td className="py-2 pr-4">
                                <div className="flex items-center gap-1 flex-wrap">
                                  {t.category_id ? (() => {
                                    const cat = catMap[t.category_id];
                                    return cat ? (
                                      <span
                                        className="text-xs px-2 py-0.5 rounded font-medium"
                                        style={{ backgroundColor: `${cat.color}30`, color: cat.color, border: `1px solid ${cat.color}60` }}
                                      >
                                        {cat.name}
                                      </span>
                                    ) : (
                                      <span className="bg-indigo-900/50 text-indigo-300 text-xs px-2 py-0.5 rounded">mapped</span>
                                    );
                                  })() : (
                                    <span className="bg-yellow-900/50 text-yellow-300 text-xs px-2 py-0.5 rounded">unmapped</span>
                                  )}
                                  {t.is_manual && (
                                    <span
                                      className="text-xs text-gray-500 bg-gray-800 border border-gray-700 px-1 py-0.5 rounded"
                                      title="Manually assigned"
                                    >
                                      M
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 text-right">
                                <button
                                  onClick={() => startEdit(t)}
                                  className="text-gray-600 hover:text-indigo-400 text-xs transition-colors"
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
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 px-3 py-1.5 rounded text-sm transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-sm text-gray-400">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300 px-3 py-1.5 rounded text-sm transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
