import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import api from "../api";
import { useAccounts } from "../context/AccountContext";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LS_KEY = "investmentCatIds";

function fmt(n, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function InvestmentPage() {
  const { selectedAccount } = useAccounts();
  const currency = selectedAccount?.currency || "EUR";

  const [year, setYear]               = useState(new Date().getFullYear());
  const [categories, setCategories]   = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
    catch { return new Set(); }
  });
  const [summaryData, setSummaryData]   = useState(null);   // /summary?year=
  const [allTimeTotals, setAllTimeTotals] = useState({});   // catId → abs(sum)
  const [savingFor, setSavingFor]       = useState(null);   // catId being saved
  const [inputValues, setInputValues]   = useState({});     // catId → string

  // ── Fetch categories ──────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    if (!selectedAccount) return;
    const { data } = await api.get(`/accounts/${selectedAccount.id}/categories`);
    setCategories(data);
    // Pre-fill input values from stored investment_value
    setInputValues((prev) => {
      const next = { ...prev };
      data.forEach((c) => {
        if (!(c.id in next)) {
          next[c.id] = c.investment_value != null ? String(c.investment_value) : "";
        }
      });
      return next;
    });
  }, [selectedAccount]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // ── Fetch yearly summary ──────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedAccount) return;
    api.get(`/accounts/${selectedAccount.id}/summary?year=${year}`)
      .then(({ data }) => setSummaryData(data))
      .catch(() => setSummaryData(null));
  }, [selectedAccount, year]);

  // ── Fetch all-time totals whenever selection changes ──────────────────────

  useEffect(() => {
    if (!selectedAccount || selectedIds.size === 0) { setAllTimeTotals({}); return; }
    const ids = [...selectedIds].join(",");
    api.get(`/accounts/${selectedAccount.id}/investment-totals?category_ids=${ids}`)
      .then(({ data }) => {
        const map = {};
        data.forEach((r) => { map[r.category_id] = Math.abs(r.total); });
        setAllTimeTotals(map);
      })
      .catch(() => setAllTimeTotals({}));
  }, [selectedAccount, selectedIds]);

  // ── Toggle category selection ─────────────────────────────────────────────

  const toggleCat = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  // ── Save current value on blur ────────────────────────────────────────────

  const handleValueBlur = async (cat) => {
    const raw = inputValues[cat.id];
    const num  = parseFloat(raw.replace(",", "."));
    if (isNaN(num) || num < 0) return;
    // Skip if unchanged
    if (cat.investment_value != null && Math.abs(cat.investment_value - num) < 0.001) return;
    setSavingFor(cat.id);
    try {
      await api.patch(`/accounts/${selectedAccount.id}/categories/${cat.id}`, {
        investment_value: num,
      });
      await fetchCategories();
    } catch {
      // silently ignore — value reverts on next fetch
    } finally {
      setSavingFor(null);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const getMonthlyData = (catId) => {
    if (!summaryData?.pivot) return Array(12).fill(0).map((_, i) => ({ name: MONTH_NAMES[i], value: 0 }));
    const row = summaryData.pivot.find((r) => r.category_id === catId);
    return MONTH_NAMES.map((name, i) => ({
      name,
      value: row ? Math.abs(parseFloat(row.monthly_totals[i + 1] || 0)) : 0,
    }));
  };

  const selectedCats = categories.filter((c) => selectedIds.has(c.id));

  // Portfolio totals (only categories where we have both contributed + current value)
  const portfolioContributed = selectedCats.reduce((s, c) => s + (allTimeTotals[c.id] || 0), 0);
  const portfolioCurrent     = selectedCats.reduce((s, c) => {
    const v = parseFloat(inputValues[c.id]);
    return s + (isNaN(v) ? 0 : v);
  }, 0);
  const portfolioGain        = portfolioCurrent - portfolioContributed;
  const portfolioGainPct     = portfolioContributed > 0
    ? ((portfolioGain / portfolioContributed) * 100).toFixed(1)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (!selectedAccount) {
    return (
      <div className="text-gray-400 text-center py-20">
        Select an account to view investments.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Header + year nav ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Investment Tracker</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm"
          >←</button>
          <span className="text-gray-200 font-medium w-12 text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm"
          >→</button>
        </div>
      </div>

      {/* ── Category selector ───────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Select investment categories
        </p>
        {categories.length === 0 ? (
          <p className="text-gray-500 text-sm">
            No categories yet — create some in Rules &amp; Categories.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = selectedIds.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCat(c.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    active
                      ? "border-transparent text-white shadow-md"
                      : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                  }`}
                  style={active ? { backgroundColor: c.color } : {}}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Investment cards ────────────────────────────────────────────── */}
      {selectedCats.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-8">
          Select one or more categories above to see their investment performance.
        </p>
      )}

      {selectedCats.map((cat) => {
        const monthData    = getMonthlyData(cat.id);
        const contributed  = allTimeTotals[cat.id] || 0;
        const rawInput     = inputValues[cat.id] ?? "";
        const currentVal   = parseFloat(rawInput.replace(",", "."));
        const hasCurrentVal = !isNaN(currentVal) && currentVal >= 0;
        const gain         = hasCurrentVal ? currentVal - contributed : null;
        const gainPct      = (contributed > 0 && gain != null)
          ? ((gain / contributed) * 100).toFixed(1)
          : null;
        const isSaving     = savingFor === cat.id;

        return (
          <div
            key={cat.id}
            className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4"
          >
            {/* Card header */}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
              <h2 className="font-semibold text-gray-100">{cat.name}</h2>
              {cat.is_income && (
                <span className="text-xs bg-green-900 text-green-300 rounded px-1.5 py-0.5">Income</span>
              )}
            </div>

            {/* All-time contributed */}
            <div className="text-sm text-gray-400">
              Total contributed{" "}
              <span className="text-gray-300 font-medium">(all time)</span>:{" "}
              <span className="text-white font-semibold">{fmt(contributed, currency)}</span>
            </div>

            {/* Monthly bar chart */}
            <div>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                Monthly contributions — {year}
              </p>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={monthData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                    tickFormatter={(v) => (v === 0 ? "" : `${(v / 1000).toFixed(0)}k`)}
                  />
                  <Tooltip
                    formatter={(v) => [fmt(v, currency), "Contributed"]}
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6 }}
                    labelStyle={{ color: "#d1d5db" }}
                    itemStyle={{ color: "#f3f4f6" }}
                  />
                  <Bar dataKey="value" fill={cat.color} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Current value input + gain */}
            <div className="border-t border-gray-800 pt-4 flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-gray-500 uppercase tracking-wide">
                  Current market value
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={rawInput}
                    onChange={(e) =>
                      setInputValues((prev) => ({ ...prev, [cat.id]: e.target.value }))
                    }
                    onBlur={() => handleValueBlur(cat)}
                    placeholder="0.00"
                    disabled={isSaving}
                    className={`w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm
                      focus:outline-none focus:ring-1 focus:ring-indigo-500
                      ${isSaving ? "opacity-50 cursor-not-allowed" : ""}`}
                  />
                  {isSaving && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                      saving…
                    </span>
                  )}
                </div>
                {cat.investment_value_updated_at && (
                  <p className="text-xs text-gray-600">
                    last updated: {fmtDate(cat.investment_value_updated_at)}
                  </p>
                )}
              </div>

              {/* Gain / loss chip */}
              {gain != null && (
                <div
                  className={`flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
                    gain >= 0
                      ? "bg-green-900/40 text-green-300"
                      : "bg-red-900/40 text-red-300"
                  }`}
                >
                  {gain >= 0 ? "+" : ""}
                  {fmt(gain, currency)}
                  {gainPct != null && (
                    <span className="ml-1 font-normal opacity-75">
                      ({gain >= 0 ? "+" : ""}{gainPct}%)
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* ── Portfolio summary ────────────────────────────────────────────── */}
      {selectedCats.length >= 2 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-4">Portfolio Summary</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-0.5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total contributed</p>
              <p className="text-lg font-bold text-white">{fmt(portfolioContributed, currency)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total current value</p>
              <p className="text-lg font-bold text-white">{fmt(portfolioCurrent, currency)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Net gain / loss</p>
              <p
                className={`text-lg font-bold ${
                  portfolioGain >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {portfolioGain >= 0 ? "+" : ""}
                {fmt(portfolioGain, currency)}
                {portfolioGainPct != null && (
                  <span className="text-sm font-normal ml-1 opacity-75">
                    ({portfolioGain >= 0 ? "+" : ""}{portfolioGainPct}%)
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
