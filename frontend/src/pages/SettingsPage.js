import React, { useRef, useState } from "react";
import api from "../api";
import { useAccounts } from "../context/AccountContext";

export default function SettingsPage() {
  const { fetchAccounts } = useAccounts();

  // ── Export ────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const handleExport = async () => {
    setExporting(true);
    setExportError("");
    try {
      const resp = await api.get("/data/export", { responseType: "blob" });
      const url  = URL.createObjectURL(resp.data);
      const a    = document.createElement("a");
      const today = new Date().toISOString().split("T")[0];
      a.href     = url;
      a.download = `smartbudget-backup-${today}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export failed — please try again.");
    } finally {
      setExporting(false);
    }
  };

  // ── Import ────────────────────────────────────────────────────────────────
  const fileRef = useRef(null);
  const [importFile, setImportFile]     = useState(null);
  const [importing, setImporting]       = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError]   = useState("");

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);
    setImportError("");
    try {
      const form = new FormData();
      form.append("file", importFile);
      const { data } = await api.post("/data/import", form);
      setImportResult(data);
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchAccounts();
    } catch (err) {
      setImportError(err.response?.data?.detail || "Import failed — check the file and try again.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* ── Backup & Restore ──────────────────────────────────────────────── */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-gray-200 border-b border-gray-800 pb-2">
          Backup &amp; Restore
        </h2>

        {/* Export */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
          <div>
            <h3 className="font-medium text-gray-100">Export all data</h3>
            <p className="text-sm text-gray-400 mt-1">
              Downloads a complete JSON backup of all your accounts, categories, transactions,
              mapping rules, and investment snapshots. Safe to re-import — duplicates are skipped.
            </p>
          </div>
          {exportError && (
            <p className="text-red-400 text-sm">{exportError}</p>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
          >
            {exporting ? "Preparing download…" : "⬇ Download Backup JSON"}
          </button>
        </div>

        {/* Import */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-medium text-gray-100">Restore from backup</h3>
            <p className="text-sm text-gray-400 mt-1">
              Upload a previously exported backup file. Data is merged — existing transactions
              are never overwritten, and duplicate records are safely skipped.
            </p>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg px-4 py-3">
            <p className="text-yellow-300 text-xs font-medium">
              ⚠ Import merges data — it will never delete or overwrite existing records.
              Re-importing the same backup is safe.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-400 uppercase tracking-wide block">
              Backup file (.json)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={(e) => {
                setImportFile(e.target.files[0] || null);
                setImportResult(null);
                setImportError("");
              }}
              className="block w-full text-sm text-gray-400
                file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0
                file:bg-gray-700 file:text-white file:text-sm hover:file:bg-gray-600 cursor-pointer"
            />
          </div>

          {importError && (
            <p className="text-red-400 text-sm">{importError}</p>
          )}

          <button
            onClick={handleImport}
            disabled={!importFile || importing}
            className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
          >
            {importing ? "Importing…" : "Import Backup"}
          </button>

          {/* Result summary */}
          {importResult && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
              <p className="text-sm font-semibold text-green-400">✓ Import complete</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { label: "Accounts created",       value: importResult.accounts_created },
                  { label: "Categories created",     value: importResult.categories_created },
                  { label: "Transactions imported",  value: importResult.transactions_imported },
                  { label: "Transactions skipped",   value: importResult.transactions_skipped },
                  { label: "Rules created",          value: importResult.rules_created },
                  { label: "Snapshots upserted",     value: importResult.snapshots_upserted },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-900 rounded px-3 py-2">
                    <p className="text-gray-500">{label}</p>
                    <p className="text-white font-semibold text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
