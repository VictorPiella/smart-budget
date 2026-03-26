import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import api, { apiError } from "../api";
import { useAccounts } from "../context/AccountContext";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const LS_KEY = "investmentCatIds";

function fmt(n, currency = "EUR") {
  return new Intl.NumberFormat("es-ES", {
    style: "currency", currency, minimumFractionDigits: 2,
  }).format(n);
}

/** For previous completed years show "31 dic. YYYY", current year show real timestamp. */
function fmtSnapDate(iso, snapshotYear) {
  if (!iso) return null;
  const thisYear = new Date().getFullYear();
  if (snapshotYear < thisYear) {
    const d = new Date(`${snapshotYear}-12-31`);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  }
  const d = new Date(iso);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit" });
}

const THIS_YEAR = new Date().getFullYear();

export default function InvestmentPage() {
  const { selectedAccount } = useAccounts();
  const currency = selectedAccount?.currency || "EUR";

  const [year, setYear]             = useState(new Date().getFullYear());
  const [categories, setCategories] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]")); }
    catch { return new Set(); }
  });

  const [summaryData, setSummaryData]     = useState(null); // bar-chart data
  const [investSummary, setInvestSummary] = useState([]);   // all-years snapshot data

  // Dirty inputs keyed by `${catId}-${year}` — only holds values the user is currently
  // editing. Cleared after a successful save. Never overwritten by API responses.
  const [dirtyInputs, setDirtyInputs] = useState({});
  const [savingFor, setSavingFor]     = useState(null);  // catId currently saving
  const [saveError, setSaveError]     = useState({});    // catId → error string

  // ── Fetch categories ──────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    if (!selectedAccount) return;
    const { data } = await api.get(`/accounts/${selectedAccount.id}/categories`);
    setCategories(data);
  }, [selectedAccount]);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  // ── Fetch bar-chart summary ───────────────────────────────────────────────

  useEffect(() => {
    if (!selectedAccount) return;
    api.get(`/accounts/${selectedAccount.id}/summary?year=${year}`)
      .then(({ data }) => setSummaryData(data))
      .catch(() => setSummaryData(null));
  }, [selectedAccount, year]);

  // ── Fetch all-years investment summary ────────────────────────────────────

  const fetchInvestSummary = useCallback(async () => {
    if (!selectedAccount || selectedIds.size === 0) {
      setInvestSummary([]);
      return;
    }
    const ids = [...selectedIds].join(",");
    try {
      const { data } = await api.get(
        `/accounts/${selectedAccount.id}/investment-summary?category_ids=${ids}`
      );
      setInvestSummary(data);
    } catch {
      // Keep existing data on failure — don't wipe the screen
    }
  }, [selectedAccount, selectedIds]);

  useEffect(() => { fetchInvestSummary(); }, [fetchInvestSummary]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const toggleCat = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });
    // Clear any dirty input for this category when deselecting
    setDirtyInputs((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(id)) delete next[k]; });
      return next;
    });
  };

  const getCatSummary = (catId) => investSummary.find((cs) => cs.category_id === catId);

  /**
   * Returns the value to show in the input for a given catId + current year.
   * Priority: dirty (user-typed) > saved snapshot > empty string.
   */
  const getDisplayValue = (catId) => {
    const key = `${catId}-${year}`;
    if (dirtyInputs[key] !== undefined) return dirtyInputs[key];
    const cs  = getCatSummary(catId);
    const row = cs?.years.find((r) => r.year === year);
    return row?.snapshot_value != null ? String(row.snapshot_value) : "";
  };

  const getSnapshotRow = (catId, yr) => {
    const cs = getCatSummary(catId);
    return cs?.years.find((r) => r.year === yr) ?? null;
  };

  const handleValueChange = (catId, val) => {
    setSaveError((prev) => { const n = { ...prev }; delete n[catId]; return n; });
    setDirtyInputs((prev) => ({ ...prev, [`${catId}-${year}`]: val }));
  };

  // ── Save snapshot on blur ─────────────────────────────────────────────────

  const handleValueBlur = async (catId) => {
    const key = `${catId}-${year}`;
    const raw = dirtyInputs[key];
    if (raw === undefined) return; // not dirty, nothing to save

    const num = parseFloat(raw.replace(",", "."));

    // Invalid input → clear dirty, show nothing
    if (isNaN(num) || num < 0) {
      setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }

    // Same as saved → just clear dirty flag
    const existing = getSnapshotRow(catId, year);
    if (existing?.snapshot_value != null && Math.abs(existing.snapshot_value - num) < 0.001) {
      setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }

    setSavingFor(catId);
    setSaveError((prev) => { const n = { ...prev }; delete n[catId]; return n; });
    try {
      await api.put(`/accounts/${selectedAccount.id}/investment-snapshots`, {
        category_id: catId,
        year,
        value: num,
      });
      // Fetch updated summary (updates year-over-year table + snapshot dates)
      await fetchInvestSummary();
      // Only clear dirty AFTER the fetch so the input doesn't flash to empty
      setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } catch (err) {
      setSaveError((prev) => ({
        ...prev,
        [catId]: apiError(err, "Could not save — check connection."),
      }));
      // Keep dirty value so the user can retry without retyping
    } finally {
      setSavingFor(null);
    }
  };

  // ── Derivations ───────────────────────────────────────────────────────────

  const getMonthlyData = (catId) => {
    if (!summaryData?.pivot)
      return Array(12).fill(0).map((_, i) => ({ name: MONTH_NAMES[i], value: 0 }));
    const row = summaryData.pivot.find((r) => r.category_id === catId);
    return MONTH_NAMES.map((name, i) => ({
      name,
      value: row ? Math.abs(parseFloat(row.monthly_totals[i + 1] || 0)) : 0,
    }));
  };

  const selectedCats = categories.filter((c) => selectedIds.has(c.id));

  // Portfolio — all-time totals using latest snapshot per category
  const portfolioRows = selectedCats.map((c) => {
    const cs = getCatSummary(c.id);
    if (!cs || cs.years.length === 0) return { contributed: 0, current: null };
    const sorted      = [...cs.years].sort((a, b) => a.year - b.year);
    const contributed = sorted[sorted.length - 1]?.cumulative ?? 0;
    const latestSnap  = sorted.slice().reverse().find((r) => r.snapshot_value != null);
    return { contributed, current: latestSnap?.snapshot_value ?? null };
  });
  const portfolioContributed = portfolioRows.reduce((s, r) => s + r.contributed, 0);
  const portfolioCurrent     = portfolioRows.reduce((s, r) => s + (r.current ?? 0), 0);
  const portfolioGain        = portfolioCurrent - portfolioContributed;
  const portfolioGainPct     = portfolioContributed > 0
    ? ((portfolioGain / portfolioContributed) * 100).toFixed(1) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (!selectedAccount) {
    return <div className="text-gray-400 text-center py-20">Select an account to view investments.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Header + year nav ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Investment Tracker</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear((y) => y - 1)}
            className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm">←</button>
          <span className="text-gray-200 font-medium w-12 text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= THIS_YEAR}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              year >= THIS_YEAR
                ? "bg-gray-800/40 text-gray-700 cursor-not-allowed"
                : "bg-gray-800 hover:bg-gray-700 text-gray-300"
            }`}
          >→</button>
        </div>
      </div>

      {/* ── Category selector ─────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold">
          Select investment categories
        </p>
        {categories.length === 0 ? (
          <p className="text-gray-500 text-sm">No categories yet — create some in Rules &amp; Categories.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = selectedIds.has(c.id);
              return (
                <button key={c.id} onClick={() => toggleCat(c.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    active ? "border-transparent text-white shadow-md"
                           : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                  }`}
                  style={active ? { backgroundColor: c.color } : {}}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Portfolio summary (top, always visible when ≥1 selected) ──── */}
      {selectedCats.length >= 1 && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-200 mb-1">Portfolio Summary</h2>
          <p className="text-xs text-gray-500 mb-4">
            Total cash deployed vs. latest recorded value — all-time return on invested capital.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total invested (cash)</p>
              <p className="text-lg font-bold text-white">{fmt(portfolioContributed, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total current value</p>
              <p className="text-lg font-bold text-white">{fmt(portfolioCurrent, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Net gain / loss</p>
              <p className={`text-lg font-bold ${portfolioGain >= 0 ? "text-green-400" : "text-red-400"}`}>
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

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {selectedCats.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-8">
          Select one or more categories above to see their investment performance.
        </p>
      )}

      {/* ── Investment cards ───────────────────────────────────────────── */}
      {selectedCats.map((cat) => {
        const cs          = getCatSummary(cat.id);
        const yearRow     = cs?.years.find((r) => r.year === year);
        const contributed = yearRow?.contributed ?? 0;
        const cumulative  = yearRow?.cumulative  ?? 0;
        const monthData   = getMonthlyData(cat.id);

        const displayVal  = getDisplayValue(cat.id);
        const currentVal  = parseFloat(displayVal.replace(",", "."));
        const hasVal      = !isNaN(currentVal) && currentVal >= 0 && displayVal !== "";

        // Period return for the card chip: use prev-year snapshot as opening value if available,
        // otherwise fall back to all-time cumulative (first year / no prev snapshot recorded).
        const prevYearRow    = cs?.years.find((r) => r.year === year - 1);
        const cardCostBasis  = prevYearRow?.snapshot_value != null
          ? prevYearRow.snapshot_value + contributed
          : cumulative;
        const gain    = hasVal ? currentVal - cardCostBasis : null;
        const gainPct = cardCostBasis > 0 && gain != null
          ? ((gain / cardCostBasis) * 100).toFixed(1) : null;

        const isSaving    = savingFor === cat.id;
        const isDirty     = dirtyInputs[`${cat.id}-${year}`] !== undefined;
        const errMsg      = saveError[cat.id];

        const lastUpdated     = yearRow?.snapshot_updated_at;
        const lastUpdatedFmt  = fmtSnapDate(lastUpdated, year);

        const allYears = cs ? [...cs.years].sort((a, b) => a.year - b.year) : [];

        return (
          <div key={cat.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">

            {/* Card header */}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
              <h2 className="font-semibold text-gray-100">{cat.name}</h2>
              {cat.is_income && (
                <span className="text-xs bg-green-900 text-green-300 rounded px-1.5 py-0.5">Income</span>
              )}
            </div>

            {/* Year stats */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Contributed in {year}: </span>
                <span className="text-white font-medium">{fmt(contributed, currency)}</span>
              </div>
              <div>
                <span className="text-gray-400">Cumulative to {year}: </span>
                <span className="text-white font-medium">{fmt(cumulative, currency)}</span>
              </div>
            </div>

            {/* Monthly bar chart */}
            <div>
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">
                Monthly contributions — {year}
              </p>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={monthData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }}
                    axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false}
                    tickLine={false} width={50}
                    tickFormatter={(v) => (v === 0 ? "" : `${(v / 1000).toFixed(0)}k`)} />
                  <Tooltip
                    formatter={(v) => [fmt(v, currency), "Contributed"]}
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 6 }}
                    labelStyle={{ color: "#d1d5db" }} itemStyle={{ color: "#f3f4f6" }}
                  />
                  <Bar dataKey="value" fill={cat.color} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Year-end value input + gain chip */}
            <div className="border-t border-gray-800 pt-4 flex flex-col sm:flex-row sm:items-end gap-4">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-gray-500 uppercase tracking-wide">
                  {year === THIS_YEAR ? "Current value" : `Value at end of ${year}`}
                  {isDirty && !isSaving && (
                    <span className="ml-2 text-yellow-500 normal-case text-xs">● unsaved</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={displayVal}
                    onChange={(e) => handleValueChange(cat.id, e.target.value)}
                    onBlur={() => handleValueBlur(cat.id)}
                    placeholder="0.00"
                    disabled={isSaving}
                    className={`w-full bg-gray-800 border rounded px-3 py-2 text-sm
                      focus:outline-none focus:ring-1 focus:ring-indigo-500
                      ${isSaving ? "opacity-50 cursor-not-allowed" : ""}
                      ${errMsg ? "border-red-600" : isDirty ? "border-yellow-600/60" : "border-gray-700"}`}
                  />
                  {isSaving && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs animate-pulse">
                      saving…
                    </span>
                  )}
                </div>

                {/* Error message */}
                {errMsg && (
                  <p className="text-xs text-red-400">{errMsg}</p>
                )}

                {/* Last updated date */}
                {lastUpdatedFmt && !errMsg && (
                  <p className="text-xs text-gray-600">
                    last saved: {lastUpdatedFmt}
                  </p>
                )}
              </div>

              {/* Gain / loss chip */}
              {gain != null && (
                <div className={`flex-shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${
                  gain >= 0 ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"
                }`}>
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

            {/* ── Year-over-year table ─────────────────────────────────── */}
            {allYears.length > 0 && (
              <div className="border-t border-gray-800 pt-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-3">Year-over-Year</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[680px]">
                    <thead>
                      <tr className="text-xs text-gray-500 uppercase border-b border-gray-800">
                        <th className="text-left pb-2 pr-4">Year</th>
                        <th className="text-right pb-2 pr-4">Contributed</th>
                        <th className="text-right pb-2 pr-4">Cumulative</th>
                        <th className="text-right pb-2 pr-4">Value</th>
                        <th className="text-right pb-2 pr-4">Annual Gain</th>
                        <th className="text-right pb-2 pr-4">%</th>
                        <th className="text-right pb-2">Recorded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allYears.map((row) => {
                        const isCurrent = row.year === year;

                        // Period return: use previous year's snapshot as the opening value.
                        // If prev snapshot is missing (first year or gap), fall back to cumulative.
                        const prevRow     = allYears.find((r) => r.year === row.year - 1);
                        const costBasis   = prevRow?.snapshot_value != null
                          ? prevRow.snapshot_value + row.contributed
                          : row.cumulative;
                        const g    = row.snapshot_value != null ? row.snapshot_value - costBasis : null;
                        const gPct = costBasis > 0 && g != null
                          ? ((g / costBasis) * 100).toFixed(1) : null;
                        const dateFmt = fmtSnapDate(row.snapshot_updated_at, row.year);
                        return (
                          <tr key={row.year}
                            className={`border-b border-gray-800/50 transition-colors ${
                              isCurrent ? "bg-indigo-900/20" : "hover:bg-gray-800/30"
                            }`}
                          >
                            <td className={`py-2 pr-4 font-medium ${isCurrent ? "text-indigo-300" : "text-gray-300"}`}>
                              {row.year}
                              {isCurrent && <span className="ml-1.5 text-xs font-normal text-indigo-400">(current)</span>}
                            </td>
                            <td className="py-2 pr-4 text-right text-gray-400">
                              {fmt(row.contributed, currency)}
                            </td>
                            <td className="py-2 pr-4 text-right text-white">
                              {fmt(row.cumulative, currency)}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {row.snapshot_value != null
                                ? <span className="text-white">{fmt(row.snapshot_value, currency)}</span>
                                : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {g != null ? (
                                <span className={g >= 0 ? "text-green-400" : "text-red-400"}>
                                  {g >= 0 ? "+" : ""}{fmt(g, currency)}
                                </span>
                              ) : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {gPct != null ? (
                                <span className={`text-sm font-semibold ${g >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {g >= 0 ? "+" : ""}{gPct}%
                                </span>
                              ) : <span className="text-gray-600">—</span>}
                            </td>
                            <td className="py-2 text-right text-gray-600 text-xs">
                              {dateFmt ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-700 mt-2 italic">
                  Annual gain = year-end value − (prior year value + new contributions).
                  First year or years without a prior snapshot use total invested as basis.
                </p>
              </div>
            )}

          </div>
        );
      })}

    </div>
  );
}
