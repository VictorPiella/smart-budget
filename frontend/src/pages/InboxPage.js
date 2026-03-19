import React, { useEffect, useState } from "react";
import api from "../api";
import { useAccounts } from "../context/AccountContext";

export default function InboxPage() {
  const { accounts, selectedAccount, fetchUnmappedCount } = useAccounts();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ruleModal, setRuleModal] = useState(null);
  const [ruleForm, setRuleForm] = useState({ category_id: "", pattern: "", match_type: "contains", priority: 0 });
  const [ruleError, setRuleError] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Checkbox / bulk-delete state ─────────────────────────────────────────
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchData = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const [txnRes, catRes] = await Promise.all([
        api.get(`/accounts/${selectedAccount.id}/transactions`, { params: { unmapped_only: true } }),
        api.get(`/accounts/${selectedAccount.id}/categories`),
      ]);
      setTransactions(txnRes.data);
      setCategories(catRes.data);
      setSelected(new Set());
      if (catRes.data.length > 0) {
        setRuleForm((f) => ({ ...f, category_id: f.category_id || catRes.data[0].id }));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedAccount]);

  const openModal = (txn) => {
    setRuleModal(txn);
    setRuleForm((f) => ({
      ...f,
      pattern: txn.raw_description,
      match_type: "contains",
      category_id: categories[0]?.id || "",
    }));
    setRuleError("");
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    setRuleError("");
    setSaving(true);
    try {
      await api.post(`/accounts/${selectedAccount.id}/rules`, {
        category_id: ruleForm.category_id,
        pattern: ruleForm.pattern,
        match_type: ruleForm.match_type,
        priority: parseInt(ruleForm.priority, 10),
      });
      await api.post(`/accounts/${selectedAccount.id}/remap`);
      setRuleModal(null);
      await fetchData();
      fetchUnmappedCount();
    } catch (err) {
      setRuleError(err.response?.data?.detail || "Failed to create rule.");
    } finally {
      setSaving(false);
    }
  };

  const [assigning, setAssigning] = useState({});

  const handleAssignCategory = async (txnId, categoryId) => {
    if (!categoryId) return;
    setAssigning((a) => ({ ...a, [txnId]: true }));
    try {
      await api.patch(`/accounts/${selectedAccount.id}/transactions/${txnId}`, { category_id: categoryId });
      setTransactions((prev) => prev.filter((t) => t.id !== txnId));
      setSelected((prev) => { const s = new Set(prev); s.delete(txnId); return s; });
      fetchUnmappedCount();
    } finally {
      setAssigning((a) => ({ ...a, [txnId]: false }));
    }
  };

  // ── Checkbox helpers ──────────────────────────────────────────────────────
  const allIds = transactions.map((t) => t.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} transaction${selected.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(
        [...selected].map((id) =>
          api.delete(`/accounts/${selectedAccount.id}/transactions/${id}`)
        )
      );
      setTransactions((prev) => prev.filter((t) => !selected.has(t.id)));
      setSelected(new Set());
      fetchUnmappedCount();
    } finally {
      setBulkDeleting(false);
    }
  };

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  if (!selectedAccount) {
    return (
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Unmapped Inbox</h1>
        <p className="text-gray-500">Select or create an account first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Unmapped Inbox</h1>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded transition-colors"
            >
              {bulkDeleting ? "Deleting…" : `Delete ${selected.size} selected`}
            </button>
          )}
          <span className="bg-yellow-700 text-yellow-100 text-sm font-semibold px-3 py-1 rounded-full">
            {transactions.length} unmapped
          </span>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        {loading ? (
          <p className="text-gray-500 text-sm">Loading...</p>
        ) : transactions.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-green-400 font-semibold text-lg">All caught up!</p>
            <p className="text-gray-500 text-sm mt-1">No unmapped transactions for {selectedAccount.name}.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-400 text-sm mb-4">
              <strong className="text-white">Assign</strong> a category directly, or <strong className="text-white">Create Rule</strong> to also categorize all future matching transactions.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs uppercase border-b border-gray-800">
                    <th className="py-2 pr-3 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="accent-indigo-500 cursor-pointer"
                        title={allSelected ? "Deselect all" : "Select all"}
                      />
                    </th>
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Description</th>
                    <th className="text-right py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Assign</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-b border-gray-800/50 hover:bg-gray-800/30 ${selected.has(t.id) ? "bg-gray-800/20" : ""}`}
                    >
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleOne(t.id)}
                          className="accent-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2 pr-4 text-gray-400 whitespace-nowrap">{t.date}</td>
                      <td className="py-2 pr-4 max-w-sm">
                        <span className="font-mono text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-200">
                          {t.raw_description}
                        </span>
                      </td>
                      <td className={`py-2 pr-4 text-right font-mono ${parseFloat(t.amount) >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {parseFloat(t.amount).toFixed(2)}
                      </td>
                      <td className="py-2 pr-4">
                        <select
                          defaultValue=""
                          disabled={categories.length === 0 || assigning[t.id]}
                          onChange={(e) => handleAssignCategory(t.id, e.target.value)}
                          className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          <option value="" disabled>— assign —</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => openModal(t)}
                          disabled={categories.length === 0}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs px-3 py-1 rounded transition-colors whitespace-nowrap"
                        >
                          Create Rule
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {categories.length === 0 && (
              <p className="text-yellow-400 text-xs mt-3">No categories found. Create categories first in the Rules page.</p>
            )}
          </>
        )}
      </div>

      {ruleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Create Mapping Rule</h2>
            <p className="text-xs text-gray-400 font-mono bg-gray-800 px-3 py-2 rounded break-all">
              {ruleModal.raw_description}
            </p>
            <form onSubmit={handleCreateRule} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Category</label>
                <select
                  value={ruleForm.category_id}
                  onChange={(e) => setRuleForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Match Type</label>
                <select
                  value={ruleForm.match_type}
                  onChange={(e) => setRuleForm((f) => ({ ...f, match_type: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="exact">Exact</option>
                  <option value="starts_with">Starts With</option>
                  <option value="contains">Contains</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Pattern</label>
                <input
                  value={ruleForm.pattern}
                  onChange={(e) => setRuleForm((f) => ({ ...f, pattern: e.target.value }))}
                  required
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Priority</label>
                <input
                  type="number"
                  value={ruleForm.priority}
                  onChange={(e) => setRuleForm((f) => ({ ...f, priority: e.target.value }))}
                  className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 w-24"
                />
              </div>
              {ruleError && <p className="text-red-400 text-xs">{ruleError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded transition-colors"
                >
                  {saving ? "Saving..." : "Save & Remap"}
                </button>
                <button
                  type="button"
                  onClick={() => setRuleModal(null)}
                  className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2 rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
