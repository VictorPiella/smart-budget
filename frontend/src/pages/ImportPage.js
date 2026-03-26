import React, { useEffect, useState } from "react";
import api, { apiError } from "../api";
import { useAccounts } from "../context/AccountContext";

// Shared result card used by CSV import and Manual Entry
function ImportResult({ result, onReset, resetLabel = "Import another file" }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Import Result</h2>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Total Rows</p>
          <p className="text-xl font-bold">{result.total_rows}</p>
        </div>
        <div className="bg-green-900/30 border border-green-800 rounded-lg p-3">
          <p className="text-xs text-green-400 mb-1">Imported</p>
          <p className="text-xl font-bold text-green-300">{result.imported}</p>
        </div>
        <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-3">
          <p className="text-xs text-yellow-400 mb-1">Duplicates Skipped</p>
          <p className="text-xl font-bold text-yellow-300">{result.skipped_duplicates}</p>
        </div>
      </div>

      {result.transactions?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-xs uppercase border-b border-gray-800">
                <th className="text-left py-2 pr-4">Date</th>
                <th className="text-left py-2 pr-4">Description</th>
                <th className="text-right py-2 pr-4">Amount</th>
                <th className="text-left py-2">Category</th>
              </tr>
            </thead>
            <tbody>
              {result.transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-800/50">
                  <td className="py-1.5 pr-4 text-gray-400">{t.date}</td>
                  <td className="py-1.5 pr-4 max-w-xs truncate">{t.raw_description}</td>
                  <td className={`py-1.5 pr-4 text-right font-mono ${parseFloat(t.amount) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {parseFloat(t.amount).toFixed(2)}
                  </td>
                  <td className="py-1.5">
                    {t.category_id
                      ? <span className="bg-indigo-900/50 text-indigo-300 text-xs px-2 py-0.5 rounded">mapped</span>
                      : <span className="bg-yellow-900/50 text-yellow-300 text-xs px-2 py-0.5 rounded">unmapped</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={onReset}
        className="text-sm text-gray-400 hover:text-white transition-colors"
      >
        {resetLabel}
      </button>
    </div>
  );
}

// ── Today's date in YYYY-MM-DD
const todayIso = () => new Date().toISOString().split("T")[0];

export default function ImportPage() {
  const { accounts, selectedAccount, setSelectedAccount, fetchAccounts, fetchUnmappedCount } = useAccounts();
  const [mode, setMode] = useState("file");

  // ── CSV flow state ────────────────────────────────────────────────────────
  const [file, setFile]       = useState(null);
  const [rawCsv, setRawCsv]   = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [mapping, setMapping] = useState({ date: "", desc: "", amount: "", extra: [] });
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState("");
  const [importing, setImporting]   = useState(false);
  const [remapping, setRemapping]   = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Manual entry state ────────────────────────────────────────────────────
  const emptyManual = () => ({ date: todayIso(), description: "", amount: "" });
  const [manualForm, setManualForm]     = useState(emptyManual());
  const [manualResult, setManualResult] = useState(null);
  const [manualError, setManualError]   = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  useEffect(() => { fetchAccounts(); }, []);

  // Reset state when account or mode changes
  useEffect(() => {
    setPreview(null);
    setResult(null);
    setError("");
    setManualResult(null);
    setManualError("");
  }, [selectedAccount, mode]);

  // ── CSV helpers ───────────────────────────────────────────────────────────

  const buildForm = () => {
    const form = new FormData();
    if (mode === "file" && file) form.append("file", file);
    else if (mode === "paste") form.append("raw_csv", rawCsv);
    return form;
  };

  const handlePreview = async (e) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setError(""); setResult(null); setPreview(null);
    setPreviewing(true);
    try {
      const { data } = await api.post(`/accounts/${selectedAccount.id}/import/preview`, buildForm());
      setPreview(data);
      setMapping({
        date:   data.detected_date_col   || "",
        desc:   data.detected_desc_col   || "",
        amount: data.detected_amount_col || "",
        extra:  [],
      });
    } catch (err) {
      setError(apiError(err, "Could not parse file."));
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    if (!selectedAccount || !preview) return;
    setShowConfirm(false);
    setError(""); setImporting(true);
    try {
      const form = buildForm();
      form.append("col_date",        mapping.date);
      form.append("col_desc",        mapping.desc);
      form.append("col_amount",      mapping.amount);
      form.append("col_extra_desc",  JSON.stringify(mapping.extra));
      const { data } = await api.post(`/accounts/${selectedAccount.id}/import`, form);
      setResult(data);
      setPreview(null);
      fetchAccounts();
      fetchUnmappedCount();
    } catch (err) {
      setError(apiError(err, "Import failed."));
    } finally {
      setImporting(false);
    }
  };

  const handleRemap = async () => {
    if (!selectedAccount) return;
    setRemapping(true);
    try {
      const { data } = await api.post(`/accounts/${selectedAccount.id}/remap`);
      alert(`Remap complete: ${data.remapped} of ${data.total} transactions updated.`);
    } catch {
      alert("Remap failed.");
    } finally {
      setRemapping(false);
    }
  };

  const toggleExtra = (col) =>
    setMapping((m) => ({
      ...m,
      extra: m.extra.includes(col) ? m.extra.filter((c) => c !== col) : [...m.extra, col],
    }));

  const canImport = mapping.date && mapping.desc && mapping.amount;

  // ── Manual entry handler ──────────────────────────────────────────────────

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccount) return;
    const amount = parseFloat(manualForm.amount);
    if (isNaN(amount)) { setManualError("Enter a valid amount."); return; }
    if (!manualForm.description.trim()) { setManualError("Description is required."); return; }
    setManualError(""); setManualSubmitting(true);
    try {
      const { data } = await api.post(`/accounts/${selectedAccount.id}/import/auto`, {
        transactions: [{
          date:        manualForm.date,
          description: manualForm.description.trim(),
          amount,
        }],
      });
      setManualResult(data);
      fetchAccounts();
    } catch (err) {
      setManualError(apiError(err, "Failed to add transaction."));
    } finally {
      setManualSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const TABS = [
    { id: "file",   label: "📁 File Upload" },
    { id: "paste",  label: "📋 Paste CSV" },
    { id: "manual", label: "✏️ Manual Entry" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Smart Import</h1>

      {/* ── Account selector (always visible) ───────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-400 uppercase tracking-wide">Target Account</label>
          <select
            value={selectedAccount?.id || ""}
            onChange={(e) => setSelectedAccount(accounts.find((a) => a.id === e.target.value) || null)}
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {accounts.length === 0 && <option value="">No accounts — create one first</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
            ))}
          </select>
        </div>

        {/* ── Tab switcher ─────────────────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setMode(t.id)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                mode === t.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CSV: File / Paste input ───────────────────────────────────── */}
        {(mode === "file" || mode === "paste") && !result && (
          <form onSubmit={handlePreview} className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-400 bg-indigo-900/40 rounded-full w-5 h-5 flex items-center justify-center">1</span>
              <span className="text-sm font-semibold text-gray-300">Upload or paste your bank export</span>
            </div>

            {mode === "file" ? (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">CSV File</label>
                <input
                  type="file"
                  accept=".csv,.tsv,text/csv,text/plain"
                  onChange={(e) => { setFile(e.target.files[0]); setPreview(null); setResult(null); }}
                  required
                  className="block w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-indigo-700 file:text-white file:text-sm hover:file:bg-indigo-600 cursor-pointer"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1">Paste Bank Data</label>
                <textarea
                  value={rawCsv}
                  onChange={(e) => { setRawCsv(e.target.value); setPreview(null); setResult(null); }}
                  rows={8}
                  placeholder={"Paste directly from your bank export.\nTab, comma, and semicolon separators are all supported."}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                />
              </div>
            )}

            {error && !preview && (
              <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={previewing || !selectedAccount}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              {previewing ? "Analysing..." : "Analyse File →"}
            </button>
          </form>
        )}

        {/* ── Manual Entry form ─────────────────────────────────────────── */}
        {mode === "manual" && !manualResult && (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-400 bg-indigo-900/40 rounded-full w-5 h-5 flex items-center justify-center">✏</span>
              <span className="text-sm font-semibold text-gray-300">Enter transaction details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400 uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={manualForm.date}
                  onChange={(e) => setManualForm((f) => ({ ...f, date: e.target.value }))}
                  required
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs text-gray-400 uppercase tracking-wide">Description</label>
                <input
                  type="text"
                  value={manualForm.description}
                  onChange={(e) => setManualForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="e.g. Amazon Prime, Salary…"
                  required
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1 max-w-xs">
              <label className="text-xs text-gray-400 uppercase tracking-wide">
                Amount
                <span className="ml-1 text-gray-600 normal-case">(negative = expense, positive = income)</span>
              </label>
              <input
                type="number"
                step="0.01"
                value={manualForm.amount}
                onChange={(e) => setManualForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="-50.00"
                required
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <p className="text-xs text-gray-500">
              Mapping rules will be applied automatically — category assigned by matching rules (same as CSV import).
            </p>

            {manualError && (
              <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">
                {manualError}
              </div>
            )}

            <button
              type="submit"
              disabled={manualSubmitting || !selectedAccount}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              {manualSubmitting ? "Adding…" : "Add Transaction"}
            </button>
          </form>
        )}
      </div>

      {/* ── CSV Step 2: column mapper ────────────────────────────────────── */}
      {preview && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-indigo-400 bg-indigo-900/40 rounded-full w-5 h-5 flex items-center justify-center">2</span>
            <span className="text-sm font-semibold text-gray-300">Map columns</span>
            <span className="text-xs text-gray-500 ml-1">— {preview.headers.length} columns detected</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { key: "date",   label: "Date column" },
              { key: "desc",   label: "Description column" },
              { key: "amount", label: "Amount column" },
            ].map(({ key, label }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">{label}</label>
                <select
                  value={mapping[key]}
                  onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                  className={`bg-gray-800 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                    mapping[key] ? "border-gray-700" : "border-yellow-600"
                  }`}
                >
                  <option value="">— select —</option>
                  {preview.headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-2">Extra columns to merge into description (optional)</p>
            <div className="flex flex-wrap gap-2">
              {preview.headers
                .filter((h) => h !== mapping.date && h !== mapping.amount)
                .map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleExtra(h)}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                      mapping.extra.includes(h)
                        ? "bg-indigo-700 border-indigo-500 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {h}
                  </button>
                ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-400 mb-2">Sample rows ({preview.sample_rows.length})</p>
            <div className="overflow-x-auto rounded border border-gray-800">
              <table className="w-full text-xs min-w-max">
                <thead>
                  <tr className="bg-gray-800">
                    {preview.headers.map((h) => (
                      <th
                        key={h}
                        className={`text-left px-3 py-2 font-medium whitespace-nowrap ${
                          [mapping.date, mapping.desc, mapping.amount].includes(h)
                            ? "text-indigo-300"
                            : mapping.extra.includes(h)
                            ? "text-yellow-300"
                            : "text-gray-500"
                        }`}
                      >
                        {h}
                        {mapping.date === h   && <span className="ml-1 text-indigo-400">(date)</span>}
                        {mapping.desc === h   && <span className="ml-1 text-indigo-400">(desc)</span>}
                        {mapping.amount === h && <span className="ml-1 text-indigo-400">(amount)</span>}
                        {mapping.extra.includes(h) && <span className="ml-1 text-yellow-400">(+desc)</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.sample_rows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/40">
                      {preview.headers.map((h) => (
                        <td
                          key={h}
                          className={`px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate ${
                            [mapping.date, mapping.desc, mapping.amount].includes(h)
                              ? "text-white"
                              : mapping.extra.includes(h)
                              ? "text-yellow-200"
                              : "text-gray-500"
                          }`}
                        >
                          {row[h] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(true)}
              disabled={!canImport || importing}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
            >
              {importing ? "Importing..." : "Import Transactions"}
            </button>
            <button
              onClick={() => { setPreview(null); setError(""); }}
              className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleRemap}
              disabled={remapping || !selectedAccount}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm px-4 py-2 rounded transition-colors ml-auto"
            >
              {remapping ? "Remapping..." : "Re-run Rules"}
            </button>
          </div>
        </div>
      )}

      {/* ── Import confirmation modal ─────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold">Confirm Import</h2>
            <p className="text-sm text-gray-300">
              Import transactions into{" "}
              <span className="text-indigo-300 font-semibold">{selectedAccount?.name}</span>?
            </p>
            <p className="text-xs text-gray-500">
              All rows will be parsed and imported. Duplicates are automatically skipped.
              Mapping rules will fire on every new transaction.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm py-2 rounded transition-colors"
              >
                {importing ? "Importing…" : "Yes, Import"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV result ───────────────────────────────────────────────────── */}
      {result && (
        <ImportResult
          result={result}
          onReset={() => setResult(null)}
          resetLabel="Import another file"
        />
      )}

      {/* ── Manual entry result ──────────────────────────────────────────── */}
      {manualResult && (
        <div className="space-y-4">
          <ImportResult
            result={manualResult}
            onReset={() => {
              setManualResult(null);
              setManualForm(emptyManual());
            }}
            resetLabel="Add another transaction"
          />
        </div>
      )}
    </div>
  );
}
