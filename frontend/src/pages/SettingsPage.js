import React, { useRef, useState } from "react";
import api, { apiError } from "../api";
import { useAccounts } from "../context/AccountContext";
import { useAuth } from "../context/AuthContext";

export default function SettingsPage() {
  const { fetchAccounts } = useAccounts();
  const { logout } = useAuth();

  // ── Delete account ────────────────────────────────────────────────────────
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting]             = useState(false);
  const [deleteError, setDeleteError]       = useState("");

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await api.delete("/auth/me", { data: { password: deletePassword } });
      logout();
    } catch {
      setDeleteError("Incorrect password or failed to delete account.");
      setDeleting(false);
    }
  };

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
      setImportError(apiError(err, "Import failed — check the file and try again."));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* ── Backup & Restore ──────────────────────────────────────────────── */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-zinc-200 border-b border-white/[0.06] pb-2">
          Backup &amp; Restore
        </h2>

        {/* Export */}
        <div className="card p-5 p-5 space-y-3">
          <div>
            <h3 className="font-medium text-zinc-100">Export all data</h3>
            <p className="text-sm text-zinc-400 mt-1">
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
            className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded transition-colors"
          >
            {exporting ? "Preparing download…" : "⬇ Download Backup JSON"}
          </button>
        </div>

        {/* Import */}
        <div className="card p-5 p-5 space-y-4">
          <div>
            <h3 className="font-medium text-zinc-100">Restore from backup</h3>
            <p className="text-sm text-zinc-400 mt-1">
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
            <label className="text-xs text-zinc-400 uppercase tracking-wide block">
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
              className="block w-full text-sm text-zinc-400
                file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0
                file:bg-zinc-700 file:text-white file:text-sm hover:file:bg-zinc-600 cursor-pointer"
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
            <div className="bg-white/[0.04] border border-white/[0.07] rounded-lg p-4 space-y-2">
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
                  <div key={label} className="bg-zinc-900 rounded px-3 py-2">
                    <p className="text-zinc-500">{label}</p>
                    <p className="text-white font-semibold text-sm">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Danger Zone ────────────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-red-400 border-b border-red-900/40 pb-2">
          Danger Zone
        </h2>
        <div className="bg-zinc-900 border border-red-900/50 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-medium text-zinc-100">Delete my account</h3>
            <p className="text-sm text-zinc-400 mt-1">
              Permanently deletes your account and <strong className="text-white">all data</strong> —
              accounts, transactions, categories, rules, and investment snapshots.
              This cannot be undone.
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-xs text-zinc-400 uppercase tracking-wide block">
              Enter your password to confirm
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your password"
              className="bg-white/[0.04] border border-white/[0.07] rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>
          {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}
          <button
            onClick={handleDeleteAccount}
            disabled={!deletePassword || deleting}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded transition-colors"
          >
            {deleting ? "Deleting…" : "Permanently delete my account"}
          </button>
        </div>
      </section>
    </div>
  );
}
