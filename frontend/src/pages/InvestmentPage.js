import React, { useCallback, useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import api, { apiError } from "../api";
import { useAccounts } from "../context/AccountContext";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const lsKey = (accountId) => `investmentCatIds-${accountId}`;

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
  const { selectedAccount, loadingAccounts } = useAccounts();
  const currency = selectedAccount?.currency || "EUR";

  const [year, setYear]             = useState(new Date().getFullYear());
  const [categories, setCategories] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [summaryData, setSummaryData]     = useState(null); // bar-chart data
  const [investSummary, setInvestSummary] = useState([]);   // all-years snapshot data

  // Dirty inputs for snapshot value — keyed by `${catId}-${year}`
  const [dirtyInputs, setDirtyInputs] = useState({});
  const [savingFor, setSavingFor]     = useState(null);
  const [saveError, setSaveError]     = useState({});

  // Dirty inputs for manual contribution — keyed by `contrib-${catId}-${year}`
  const [dirtyContribs, setDirtyContribs]   = useState({});
  const [savingContrib, setSavingContrib]   = useState(null); // `${catId}-${year}`
  const [saveContribErr, setSaveContribErr] = useState({});   // `${catId}-${year}` → string

  // ── Restore selected investment categories when account changes ───────────

  useEffect(() => {
    if (!selectedAccount) return;
    try {
      const saved = JSON.parse(localStorage.getItem(lsKey(selectedAccount.id)) || "[]");
      setSelectedIds(new Set(saved));
    } catch {
      setSelectedIds(new Set());
    }
  }, [selectedAccount]);

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
      if (selectedAccount) {
        localStorage.setItem(lsKey(selectedAccount.id), JSON.stringify([...next]));
      }
      return next;
    });
    setDirtyInputs((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(id)) delete next[k]; });
      return next;
    });
    setDirtyContribs((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.includes(id)) delete next[k]; });
      return next;
    });
  };

  const getCatSummary = (catId) => investSummary.find((cs) => cs.category_id === catId);

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

  const getContribDisplay = (catId, yr) => {
    const key = `contrib-${catId}-${yr}`;
    if (dirtyContribs[key] !== undefined) return dirtyContribs[key];
    const row = getSnapshotRow(catId, yr);
    return row?.manual_contribution != null ? String(row.manual_contribution) : "";
  };

  const handleValueChange = (catId, val) => {
    setSaveError((prev) => { const n = { ...prev }; delete n[catId]; return n; });
    setDirtyInputs((prev) => ({ ...prev, [`${catId}-${year}`]: val }));
  };

  const handleContribChange = (catId, yr, val) => {
    const ek = `${catId}-${yr}`;
    setSaveContribErr((prev) => { const n = { ...prev }; delete n[ek]; return n; });
    setDirtyContribs((prev) => ({ ...prev, [`contrib-${catId}-${yr}`]: val }));
  };

  // ── Save snapshot value on blur ───────────────────────────────────────────

  const handleValueBlur = async (catId) => {
    const key = `${catId}-${year}`;
    const raw = dirtyInputs[key];
    if (raw === undefined) return;

    const num = parseFloat(raw.replace(",", "."));
    if (isNaN(num) || num < 0) {
      setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return;
    }

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
      await fetchInvestSummary();
      setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
    } catch (err) {
      setSaveError((prev) => ({
        ...prev,
        [catId]: apiError(err, "Could not save — check connection."),
      }));
    } finally {
      setSavingFor(null);
    }
  };

  // ── Save manual contribution on blur ──────────────────────────────────────

  const handleContribBlur = async (catId, yr) => {
    const dk  = `contrib-${catId}-${yr}`;
    const ek  = `${catId}-${yr}`;
    const raw = dirtyContribs[dk];
    if (raw === undefined) return;

    const num = parseFloat(raw.replace(",", "."));
    if (isNaN(num) || num < 0) {
      setDirtyContribs((prev) => { const n = { ...prev }; delete n[dk]; return n; });
      return;
    }

    const existing = getSnapshotRow(catId, yr);
    if (existing?.manual_contribution != null && Math.abs(existing.manual_contribution - num) < 0.001) {
      setDirtyContribs((prev) => { const n = { ...prev }; delete n[dk]; return n; });
      return;
    }

    setSavingContrib(ek);
    setSaveContribErr((prev) => { const n = { ...prev }; delete n[ek]; return n; });
    try {
      await api.put(`/accounts/${selectedAccount.id}/investment-snapshots`, {
        category_id:         catId,
        year:                yr,
        manual_contribution: num,
      });
      await fetchInvestSummary();
      setDirtyContribs((prev) => { const n = { ...prev }; delete n[dk]; return n; });
    } catch (err) {
      setSaveContribErr((prev) => ({
        ...prev,
        [ek]: apiError(err, "Could not save."),
      }));
    } finally {
      setSavingContrib(null);
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

  // Portfolio summary — cumulative already includes manual contributions (server-side)
  const portfolioRows = selectedCats.map((c) => {
    const cs = getCatSummary(c.id);
    if (!cs || cs.years.length === 0) return { contributed: 0, current: null };
    const sorted     = [...cs.years].sort((a, b) => a.year - b.year);
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

  if (loadingAccounts) {
    return <div className="text-zinc-500 text-sm py-20 text-center">Loading…</div>;
  }
  if (!selectedAccount) {
    return <div className="text-zinc-400 text-center py-20">Select an account to view investments.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Header + year nav ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Investment Tracker</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setYear((y) => y - 1)}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm">←</button>
          <span className="text-zinc-200 font-medium w-12 text-center">{year}</span>
          <button
            onClick={() => setYear((y) => y + 1)}
            disabled={year >= THIS_YEAR}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              year >= THIS_YEAR
                ? "bg-white/[0.03] text-zinc-700 cursor-not-allowed"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            }`}
          >→</button>
        </div>
      </div>

      {/* ── Category selector ─────────────────────────────────────────── */}
      <div className="card p-5 p-4 space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">
          Select investment categories
        </p>
        {categories.length === 0 ? (
          <p className="text-zinc-500 text-sm">No categories yet — create some in Rules &amp; Categories.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = selectedIds.has(c.id);
              return (
                <button key={c.id} onClick={() => toggleCat(c.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                    active ? "border-transparent text-white shadow-md"
                           : "border-white/[0.08] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
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

      {/* ── Portfolio summary ──────────────────────────────────────────── */}
      {selectedCats.length >= 1 && (
        <div className="card p-5 p-5">
          <h2 className="font-semibold text-zinc-200 mb-1">Portfolio Summary</h2>
          <p className="text-xs text-zinc-500 mb-4">
            Total cash deployed vs. latest recorded value — all-time return on invested capital.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Total invested (cash)</p>
              <p className="text-lg font-bold text-white">{fmt(portfolioContributed, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Total current value</p>
              <p className="text-lg font-bold text-white">{fmt(portfolioCurrent, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wide">Net gain / loss</p>
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

      {selectedCats.length === 0 && (
        <p className="text-zinc-500 text-sm text-center py-8">
          Select one or more categories above to see their investment performance.
        </p>
      )}

      {/* ── Investment cards ───────────────────────────────────────────── */}
      {selectedCats.map((cat) => {
        const cs          = getCatSummary(cat.id);
        const yearRow     = cs?.years.find((r) => r.year === year);
        const contributed = yearRow?.contributed ?? 0;
        const cumulative  = yearRow?.cumulative  ?? 0;
        const isManualYear = yearRow?.is_manual ?? false;
        const monthData   = getMonthlyData(cat.id);

        const displayVal  = getDisplayValue(cat.id);
        const currentVal  = parseFloat(displayVal.replace(",", "."));
        const hasVal      = !isNaN(currentVal) && currentVal >= 0 && displayVal !== "";

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

        const lastUpdated    = yearRow?.snapshot_updated_at;
        const lastUpdatedFmt = fmtSnapDate(lastUpdated, year);

        const allYears = cs ? [...cs.years].sort((a, b) => a.year - b.year) : [];

        // Manual contribution input state for the current year card
        const contribDk        = `contrib-${cat.id}-${year}`;
        const contribDisplay   = getContribDisplay(cat.id, year);
        const isContribDirty   = dirtyContribs[contribDk] !== undefined;
        const isContribSaving  = savingContrib === `${cat.id}-${year}`;
        const contribErrMsg    = saveContribErr[`${cat.id}-${year}`];

        return (
          <div key={cat.id} className="card p-5 p-5 space-y-4">

            {/* Card header */}
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
              <h2 className="font-semibold text-zinc-100">{cat.name}</h2>
              {cat.is_income && (
                <span className="text-xs bg-green-900 text-green-300 rounded px-1.5 py-0.5">Income</span>
              )}
            </div>

            {/* Year stats */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-zinc-400">Contributed in {year}: </span>
                <span className="text-white font-medium">{fmt(contributed, currency)}</span>
                {isManualYear && (
                  <span className="ml-1.5 text-xs text-amber-400 font-normal">(manual)</span>
                )}
              </div>
              <div>
                <span className="text-zinc-400">Cumulative to {year}: </span>
                <span className="text-white font-medium">{fmt(cumulative, currency)}</span>
              </div>
            </div>

            {/* Monthly bar chart — only useful if there are actual transactions */}
            {!isManualYear && (
              <div>
                <p className="text-xs text-zinc-500 mb-2 uppercase tracking-wide">
                  Monthly contributions — {year}
                </p>
                <ResponsiveContainer width="100%" height={130}>
                  <BarChart data={monthData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
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
            )}

            {/* Snapshot value + manual contribution inputs */}
            <div className="border-t border-white/[0.06] pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Manual contribution input */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wide">
                  Contributed in {year}
                  <span className="ml-1 normal-case text-zinc-600">(manual override)</span>
                  {isContribDirty && !isContribSaving && (
                    <span className="ml-2 text-yellow-500 normal-case text-xs">● unsaved</span>
                  )}
                </label>
                {(yearRow?.tx_contributed ?? 0) > 0 ? (
                  // Has real transactions — show read-only, input disabled
                  <div className="w-full bg-zinc-800/50 border border-white/[0.08]/50 rounded px-3 py-2 text-sm text-zinc-500 cursor-not-allowed flex items-center justify-between">
                    <span>{fmt(yearRow.tx_contributed, currency)}</span>
                    <span className="text-xs text-zinc-600">from transactions</span>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={contribDisplay}
                      onChange={(e) => handleContribChange(cat.id, year, e.target.value)}
                      onBlur={() => handleContribBlur(cat.id, year)}
                      placeholder="0.00"
                      disabled={isContribSaving}
                      className={`w-full bg-zinc-800 border rounded px-3 py-2 text-sm
                        focus:outline-none focus:ring-1 focus:ring-amber-500
                        ${isContribSaving ? "opacity-50 cursor-not-allowed" : ""}
                        ${contribErrMsg ? "border-red-600" : isContribDirty ? "border-yellow-600/60" : "border-white/[0.08]"}`}
                    />
                    {isContribSaving && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs animate-pulse">
                        saving…
                      </span>
                    )}
                  </div>
                )}
                {contribErrMsg && <p className="text-xs text-red-400">{contribErrMsg}</p>}
                {(yearRow?.tx_contributed ?? 0) === 0 && (
                  <p className="text-xs text-zinc-600">
                    {isManualYear ? "Manual — no transactions for this year" : "No transactions — enter the amount manually"}
                  </p>
                )}
              </div>

              {/* Year-end value input */}
              <div className="space-y-1">
                <label className="text-xs text-zinc-500 uppercase tracking-wide">
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
                    className={`w-full bg-zinc-800 border rounded px-3 py-2 text-sm
                      focus:outline-none focus:ring-1 focus:ring-cyan-400
                      ${isSaving ? "opacity-50 cursor-not-allowed" : ""}
                      ${errMsg ? "border-red-600" : isDirty ? "border-yellow-600/60" : "border-white/[0.08]"}`}
                  />
                  {isSaving && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs animate-pulse">
                      saving…
                    </span>
                  )}
                </div>
                {errMsg && <p className="text-xs text-red-400">{errMsg}</p>}
                {lastUpdatedFmt && !errMsg && (
                  <p className="text-xs text-zinc-600">last saved: {lastUpdatedFmt}</p>
                )}
              </div>
            </div>

            {/* Gain / loss chip */}
            {gain != null && (
              <div className={`rounded-lg px-4 py-2 text-sm font-semibold inline-flex items-center gap-2 ${
                gain >= 0 ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"
              }`}>
                {gain >= 0 ? "+" : ""}
                {fmt(gain, currency)}
                {gainPct != null && (
                  <span className="font-normal opacity-75">
                    ({gain >= 0 ? "+" : ""}{gainPct}%)
                  </span>
                )}
                <span className="text-xs font-normal opacity-50">
                  {prevYearRow?.snapshot_value != null ? `vs ${year - 1} close` : "all-time"}
                </span>
              </div>
            )}

            {/* ── Year-over-year table ─────────────────────────────────── */}
            {allYears.length > 0 && (
              <div className="border-t border-white/[0.06] pt-4">
                <p className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Year-over-Year</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-xs text-zinc-500 uppercase border-b border-white/[0.06]">
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

                        const prevRow   = allYears.find((r) => r.year === row.year - 1);
                        const costBasis = prevRow?.snapshot_value != null
                          ? prevRow.snapshot_value + row.contributed
                          : row.cumulative;
                        const g    = row.snapshot_value != null ? row.snapshot_value - costBasis : null;
                        const gPct = costBasis > 0 && g != null
                          ? ((g / costBasis) * 100).toFixed(1) : null;
                        const dateFmt = fmtSnapDate(row.snapshot_updated_at, row.year);

                        // Inline manual-contribution editing in the YoY table
                        const rowDk       = `contrib-${cat.id}-${row.year}`;
                        const rowDisplay  = getContribDisplay(cat.id, row.year);
                        const rowDirty    = dirtyContribs[rowDk] !== undefined;
                        const rowSaving   = savingContrib === `${cat.id}-${row.year}`;

                        return (
                          <tr key={row.year}
                            className={`border-b border-white/[0.05] transition-colors ${
                              isCurrent ? "bg-cyan-900/20" : "hover:bg-white/[0.02]"
                            }`}
                          >
                            <td className={`py-2 pr-4 font-medium ${isCurrent ? "text-cyan-300" : "text-zinc-300"}`}>
                              {row.year}
                              {isCurrent && <span className="ml-1.5 text-xs font-normal text-cyan-400">(current)</span>}
                            </td>

                            {/* Contributed — editable for manual override */}
                            <td className="py-2 pr-4 text-right">
                              {row.is_manual ? (
                                // Already has a manual value — show it with edit capability
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-amber-300">{fmt(row.contributed, currency)}</span>
                                  <span className="text-xs text-amber-600 font-normal">M</span>
                                </div>
                              ) : row.tx_contributed > 0 ? (
                                // Has real transactions — show auto value
                                <span className="text-zinc-400">{fmt(row.contributed, currency)}</span>
                              ) : (
                                // No transactions, no manual — editable inline
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={rowDisplay}
                                  onChange={(e) => handleContribChange(cat.id, row.year, e.target.value)}
                                  onBlur={() => handleContribBlur(cat.id, row.year)}
                                  placeholder="0.00"
                                  disabled={rowSaving}
                                  className={`w-28 bg-zinc-800 border rounded px-2 py-1 text-xs text-right
                                    focus:outline-none focus:ring-1 focus:ring-amber-500
                                    ${rowDirty ? "border-yellow-600/60" : "border-white/[0.08]"}
                                    ${rowSaving ? "opacity-50" : ""}`}
                                />
                              )}
                            </td>

                            <td className="py-2 pr-4 text-right text-white">
                              {fmt(row.cumulative, currency)}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {row.snapshot_value != null
                                ? <span className="text-white">{fmt(row.snapshot_value, currency)}</span>
                                : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {g != null ? (
                                <span className={g >= 0 ? "text-green-400" : "text-red-400"}>
                                  {g >= 0 ? "+" : ""}{fmt(g, currency)}
                                </span>
                              ) : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="py-2 pr-4 text-right">
                              {gPct != null ? (
                                <span className={`text-sm font-semibold ${g >= 0 ? "text-green-400" : "text-red-400"}`}>
                                  {g >= 0 ? "+" : ""}{gPct}%
                                </span>
                              ) : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="py-2 text-right text-zinc-600 text-xs">
                              {dateFmt ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-zinc-700 mt-2 italic">
                  Annual gain = year-end value − (prior year value + new contributions).
                  First year or years without a prior snapshot use total cumulative as basis.
                  <span className="ml-2 text-amber-700">M = manual contribution override.</span>
                </p>
              </div>
            )}

          </div>
        );
      })}

    </div>
  );
}
