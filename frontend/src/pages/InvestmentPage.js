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
    const d = new Date(snapshotYear, 11, 31);
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

  // Extra empty years shown before the first year with data — keyed by category id
  const [extraYearsBack, setExtraYearsBack] = useState({});
  // Year-over-Year row currently in edit mode: `${catId}-${year}` or null
  const [editingRow, setEditingRow] = useState(null);

  // ── Fetch categories (the investment selection is stored server-side) ─────

  const fetchCategories = useCallback(async () => {
    if (!selectedAccount) return;
    const accountId = selectedAccount.id;
    let { data } = await api.get(`/accounts/${accountId}/categories`);

    // One-time migration: older versions kept the selection in localStorage.
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem(lsKey(accountId)) || "[]"); } catch { /* ignore */ }
    if (legacy.length && !data.some((c) => c.is_investment)) {
      const ids = new Set(legacy);
      await Promise.all(
        data.filter((c) => ids.has(c.id)).map((c) =>
          api.patch(`/accounts/${accountId}/categories/${c.id}`, { is_investment: true })
        )
      );
      data = data.map((c) => (ids.has(c.id) ? { ...c, is_investment: true } : c));
    }
    try { localStorage.removeItem(lsKey(accountId)); } catch { /* ignore */ }

    setCategories(data);
    setSelectedIds(new Set(data.filter((c) => c.is_investment).map((c) => c.id)));
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
    const enable = !selectedIds.has(id);
    const apply  = (on) => setSelectedIds((prev) => {
      const next = new Set(prev);
      on ? next.add(id) : next.delete(id);
      return next;
    });
    apply(enable);   // optimistic
    api.patch(`/accounts/${selectedAccount.id}/categories/${id}`, { is_investment: enable })
      .catch(() => apply(!enable));
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

  // Every year from the first one with data (or earlier, via "+ Add year")
  // up to today, so years without transactions can still get a value.
  const buildYearRows = (cs, back) => {
    const known  = cs ? cs.years : [];
    const byYear = Object.fromEntries(known.map((r) => [r.year, r]));
    const first  = Math.min(THIS_YEAR, ...known.map((r) => r.year)) - back;
    const last   = Math.max(THIS_YEAR, ...known.map((r) => r.year));
    const rows   = [];
    let cumulative = 0;
    for (let y = first; y <= last; y++) {
      const r = byYear[y] ?? {
        year: y, contributed: 0, tx_contributed: 0, is_manual: false, cumulative,
        snapshot_value: null, manual_contribution: null, snapshot_updated_at: null,
      };
      cumulative = r.cumulative;
      rows.push(r);
    }
    return rows;
  };

  const getDisplayValue = (catId, yr = year) => {
    const key = `${catId}-${yr}`;
    if (dirtyInputs[key] !== undefined) return dirtyInputs[key];
    const cs  = getCatSummary(catId);
    const row = cs?.years.find((r) => r.year === yr);
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

  const handleValueChange = (catId, val, yr = year) => {
    const key = `${catId}-${yr}`;
    setSaveError((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setDirtyInputs((prev) => ({ ...prev, [key]: val }));
  };

  const handleContribChange = (catId, yr, val) => {
    const ek = `${catId}-${yr}`;
    setSaveContribErr((prev) => { const n = { ...prev }; delete n[ek]; return n; });
    setDirtyContribs((prev) => ({ ...prev, [`contrib-${catId}-${yr}`]: val }));
  };

  // ── Save snapshot value on blur ───────────────────────────────────────────

  const handleValueBlur = async (catId, yr = year) => {
    const key = `${catId}-${yr}`;
    const raw = dirtyInputs[key];
    if (raw === undefined) return true;

    const num = parseFloat(raw.replace(",", "."));
    if (isNaN(num) || num < 0) {
      setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return true;
    }

    const existing = getSnapshotRow(catId, yr);
    if (existing?.snapshot_value != null && Math.abs(existing.snapshot_value - num) < 0.001) {
      setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return true;
    }

    setSavingFor(key);
    setSaveError((prev) => { const n = { ...prev }; delete n[key]; return n; });
    try {
      await api.put(`/accounts/${selectedAccount.id}/investment-snapshots`, {
        category_id: catId,
        year: yr,
        value: num,
      });
      await fetchInvestSummary();
      setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
      return true;
    } catch (err) {
      setSaveError((prev) => ({
        ...prev,
        [key]: apiError(err, "Could not save — check connection."),
      }));
      return false;
    } finally {
      setSavingFor(null);
    }
  };

  // ── Save manual contribution on blur ──────────────────────────────────────

  const handleContribBlur = async (catId, yr) => {
    const dk  = `contrib-${catId}-${yr}`;
    const ek  = `${catId}-${yr}`;
    const raw = dirtyContribs[dk];
    if (raw === undefined) return true;

    const num = parseFloat(raw.replace(",", "."));
    if (isNaN(num) || num < 0) {
      setDirtyContribs((prev) => { const n = { ...prev }; delete n[dk]; return n; });
      return true;
    }

    const existing = getSnapshotRow(catId, yr);
    if (existing?.manual_contribution != null && Math.abs(existing.manual_contribution - num) < 0.001) {
      setDirtyContribs((prev) => { const n = { ...prev }; delete n[dk]; return n; });
      return true;
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
      return true;
    } catch (err) {
      setSaveContribErr((prev) => ({
        ...prev,
        [ek]: apiError(err, "Could not save."),
      }));
      return false;
    } finally {
      setSavingContrib(null);
    }
  };

  // ── Year-over-Year row edit mode (✎ → inputs → save / cancel) ─────────────

  const startRowEdit = (catId, yr) => {
    if (editingRow) cancelRowEdit();
    setEditingRow(`${catId}-${yr}`);
  };

  const cancelRowEdit = () => {
    if (!editingRow) return;
    const key = editingRow;
    setDirtyInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setDirtyContribs((prev) => { const n = { ...prev }; delete n[`contrib-${key}`]; return n; });
    setSaveError((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setSaveContribErr((prev) => { const n = { ...prev }; delete n[key]; return n; });
    setEditingRow(null);
  };

  const saveRowEdit = async (catId, yr) => {
    const okContrib = await handleContribBlur(catId, yr);
    const okValue   = await handleValueBlur(catId, yr);
    if (okContrib && okValue) setEditingRow(null);   // stay open to show the error
  };

  const rowKeyDown = (catId, yr) => (e) => {
    if (e.key === "Enter")  { e.preventDefault(); saveRowEdit(catId, yr); }
    if (e.key === "Escape") { e.preventDefault(); cancelRowEdit(); }
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

        const isSaving    = savingFor === `${cat.id}-${year}`;
        const isDirty     = dirtyInputs[`${cat.id}-${year}`] !== undefined;
        const errMsg      = saveError[`${cat.id}-${year}`];

        const lastUpdated    = yearRow?.snapshot_updated_at;
        const lastUpdatedFmt = fmtSnapDate(lastUpdated, year);

        const allYears = buildYearRows(cs, extraYearsBack[cat.id] || 0);

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
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
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-zinc-500 uppercase tracking-wide">Year-over-Year</p>
                  <button
                    onClick={() => setExtraYearsBack((prev) => ({ ...prev, [cat.id]: (prev[cat.id] || 0) + 1 }))}
                    className="text-xs text-zinc-400 hover:text-white border border-white/[0.08] rounded px-2 py-1"
                  >
                    + Add {allYears[0]?.year - 1}
                  </button>
                </div>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-xs text-zinc-500 uppercase border-b border-white/[0.06]">
                        <th className="text-left pb-2 pr-4">Year</th>
                        <th className="text-right pb-2 pr-4">Contributed</th>
                        <th className="text-right pb-2 pr-4">Cumulative</th>
                        <th className="text-right pb-2 pr-4">Value</th>
                        <th className="text-right pb-2 pr-4">Annual Gain</th>
                        <th className="text-right pb-2 pr-4">%</th>
                        <th className="text-right pb-2 pr-2">Recorded</th>
                        <th className="pb-2 w-16"></th>
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

                        const rowKey      = `${cat.id}-${row.year}`;
                        const isEditing   = editingRow === rowKey;
                        const contribEditable = !(row.tx_contributed > 0 && !row.is_manual);
                        const rowSaving   = savingContrib === rowKey || savingFor === rowKey;
                        const rowError    = saveError[rowKey] || saveContribErr[rowKey];
                        const inputCls    = "w-28 bg-zinc-800 border border-white/[0.12] rounded px-2 py-1 text-xs text-right " +
                                            "focus:outline-none focus:ring-1 focus:ring-cyan-400";

                        return (
                          <tr key={row.year}
                            className={`group border-b border-white/[0.05] transition-colors ${
                              isEditing ? "bg-white/[0.04]" : isCurrent ? "bg-cyan-900/20" : "hover:bg-white/[0.02]"
                            }`}
                          >
                            <td className={`py-2 pr-4 font-medium ${isCurrent ? "text-cyan-300" : "text-zinc-300"}`}>
                              {row.year}
                              {isCurrent && <span className="ml-1.5 text-xs font-normal text-cyan-400">(current)</span>}
                            </td>

                            {/* Contributed — from transactions, or a manual override */}
                            <td className="py-2 pr-4 text-right">
                              {isEditing && contribEditable ? (
                                <input
                                  type="number" min="0" step="0.01" inputMode="decimal"
                                  autoFocus
                                  value={getContribDisplay(cat.id, row.year)}
                                  onChange={(e) => handleContribChange(cat.id, row.year, e.target.value)}
                                  onKeyDown={rowKeyDown(cat.id, row.year)}
                                  placeholder="0.00"
                                  disabled={rowSaving}
                                  className={inputCls}
                                />
                              ) : row.is_manual ? (
                                <span className="text-amber-300" title="Manual contribution">
                                  {fmt(row.contributed, currency)}
                                  <span className="ml-1 text-xs text-amber-600">M</span>
                                </span>
                              ) : row.contributed > 0 ? (
                                <span className="text-zinc-400" title="From transactions">{fmt(row.contributed, currency)}</span>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>

                            <td className="py-2 pr-4 text-right text-white">
                              {fmt(row.cumulative, currency)}
                            </td>

                            {/* Value — at 31 Dec for past years, current value for this year */}
                            <td className="py-2 pr-4 text-right">
                              {isEditing ? (
                                <input
                                  type="number" min="0" step="0.01" inputMode="decimal"
                                  autoFocus={!contribEditable}
                                  value={getDisplayValue(cat.id, row.year)}
                                  onChange={(e) => handleValueChange(cat.id, e.target.value, row.year)}
                                  onKeyDown={rowKeyDown(cat.id, row.year)}
                                  placeholder={row.year < THIS_YEAR ? `31 Dec ${row.year}` : "Current"}
                                  disabled={rowSaving}
                                  className={inputCls}
                                />
                              ) : row.snapshot_value != null ? (
                                <span className="text-white">{fmt(row.snapshot_value, currency)}</span>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
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
                            <td className="py-2 pr-2 text-right text-xs">
                              {rowError
                                ? <span className="text-red-400">{rowError}</span>
                                : <span className="text-zinc-600">{dateFmt ?? "—"}</span>}
                            </td>

                            {/* Actions */}
                            <td className="py-2 text-right whitespace-nowrap">
                              {isEditing ? (
                                <>
                                  <button onClick={() => saveRowEdit(cat.id, row.year)} disabled={rowSaving}
                                    title="Save (Enter)"
                                    className="px-1.5 text-green-400 hover:text-green-300 disabled:opacity-40">
                                    {rowSaving ? "…" : "✓"}
                                  </button>
                                  <button onClick={cancelRowEdit} title="Cancel (Esc)"
                                    className="px-1.5 text-zinc-500 hover:text-zinc-300">
                                    ✕
                                  </button>
                                </>
                              ) : (
                                <button onClick={() => startRowEdit(cat.id, row.year)}
                                  title={`Edit ${row.year}`}
                                  className="px-1.5 text-zinc-600 hover:text-cyan-400 transition-colors">
                                  ✎
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="sm:hidden space-y-2">
                  {[...allYears].reverse().map((row) => {
                    const prevRow   = allYears.find((r) => r.year === row.year - 1);
                    const costBasis = prevRow?.snapshot_value != null
                      ? prevRow.snapshot_value + row.contributed
                      : row.cumulative;
                    const g    = row.snapshot_value != null ? row.snapshot_value - costBasis : null;
                    const gPct = costBasis > 0 && g != null ? ((g / costBasis) * 100).toFixed(1) : null;

                    const rowKey    = `${cat.id}-${row.year}`;
                    const isEditing = editingRow === rowKey;
                    const contribEditable = !(row.tx_contributed > 0 && !row.is_manual);
                    const rowSaving = savingContrib === rowKey || savingFor === rowKey;
                    const rowError  = saveError[rowKey] || saveContribErr[rowKey];
                    const field     = "w-full bg-zinc-800 border border-white/[0.12] rounded-lg px-3 py-2 text-sm text-right " +
                                      "focus:outline-none focus:ring-1 focus:ring-cyan-400";
                    const isThisYear = row.year === THIS_YEAR;

                    return (
                      <div key={row.year}
                        className={`rounded-xl p-3 border ${
                          isEditing ? "border-cyan-500/40 bg-white/[0.04]"
                          : isThisYear ? "border-cyan-500/20 bg-cyan-900/10"
                          : "border-white/[0.06] bg-white/[0.02]"}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-semibold ${isThisYear ? "text-cyan-300" : "text-zinc-200"}`}>
                            {row.year}
                            {isThisYear && <span className="ml-1.5 text-xs font-normal text-cyan-400">(current)</span>}
                          </span>
                          {!isEditing && (
                            <button onClick={() => startRowEdit(cat.id, row.year)}
                              className="text-zinc-500 hover:text-cyan-400 px-2 py-1 -mr-2" title={`Edit ${row.year}`}>
                              ✎
                            </button>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-2">
                            {contribEditable ? (
                              <label className="block">
                                <span className="text-[11px] text-zinc-500 uppercase tracking-wide">Contributed in {row.year}</span>
                                <input type="number" min="0" step="0.01" inputMode="decimal" autoFocus
                                  value={getContribDisplay(cat.id, row.year)}
                                  onChange={(e) => handleContribChange(cat.id, row.year, e.target.value)}
                                  onKeyDown={rowKeyDown(cat.id, row.year)}
                                  placeholder="0.00" disabled={rowSaving} className={field} />
                              </label>
                            ) : (
                              <p className="text-xs text-zinc-500">
                                Contributed {fmt(row.contributed, currency)} (from transactions)
                              </p>
                            )}
                            <label className="block">
                              <span className="text-[11px] text-zinc-500 uppercase tracking-wide">
                                {row.year < THIS_YEAR ? `Value at 31 Dec ${row.year}` : "Current value"}
                              </span>
                              <input type="number" min="0" step="0.01" inputMode="decimal" autoFocus={!contribEditable}
                                value={getDisplayValue(cat.id, row.year)}
                                onChange={(e) => handleValueChange(cat.id, e.target.value, row.year)}
                                onKeyDown={rowKeyDown(cat.id, row.year)}
                                placeholder="0.00" disabled={rowSaving} className={field} />
                            </label>
                            {rowError && <p className="text-xs text-red-400">{rowError}</p>}
                            <div className="flex gap-2 pt-1">
                              <button onClick={() => saveRowEdit(cat.id, row.year)} disabled={rowSaving}
                                className="flex-1 bg-cyan-500 disabled:opacity-50 text-white text-sm py-2 rounded-lg">
                                {rowSaving ? "Saving…" : "Save"}
                              </button>
                              <button onClick={cancelRowEdit}
                                className="flex-1 bg-white/[0.05] text-zinc-300 text-sm py-2 rounded-lg">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                            <div>
                              <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Contributed</p>
                              <p className={row.is_manual ? "text-amber-300" : "text-zinc-300"}>
                                {row.contributed > 0 || row.is_manual ? fmt(row.contributed, currency) : "—"}
                                {row.is_manual && <span className="ml-1 text-xs text-amber-600">M</span>}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Cumulative</p>
                              <p className="text-white">{fmt(row.cumulative, currency)}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-zinc-500 uppercase tracking-wide">
                                {row.year < THIS_YEAR ? "Value 31 Dec" : "Value"}
                              </p>
                              <p className={row.snapshot_value != null ? "text-white font-medium" : "text-zinc-600"}>
                                {row.snapshot_value != null ? fmt(row.snapshot_value, currency) : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-zinc-500 uppercase tracking-wide">Annual gain</p>
                              {g != null ? (
                                <p className={g >= 0 ? "text-green-400" : "text-red-400"}>
                                  {g >= 0 ? "+" : ""}{fmt(g, currency)}
                                  {gPct != null && <span className="ml-1 text-xs opacity-75">({g >= 0 ? "+" : ""}{gPct}%)</span>}
                                </p>
                              ) : <p className="text-zinc-600">—</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-zinc-700 mt-2 italic">
                  Value = market value at 31 Dec of that year (current value for {THIS_YEAR}).
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
