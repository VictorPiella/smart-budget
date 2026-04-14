import React, { useEffect, useState } from "react";
import api, { apiError } from "../api";
import { useAccounts } from "../context/AccountContext";

export default function RulesPage() {
  const { selectedAccount, fetchAccounts, fetchUnmappedCount } = useAccounts();
  const [categories, setCategories] = useState([]);
  const [rules, setRules] = useState([]);
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6366f1");
  const [newCatIsIncome, setNewCatIsIncome] = useState(false);
  const [newCatExclude, setNewCatExclude] = useState(false);
  const [catError, setCatError] = useState("");
  const [ruleForm, setRuleForm] = useState({ category_id: "", pattern: "", match_type: "contains", priority: 0 });
  const [ruleError, setRuleError] = useState("");
  const [editingCat, setEditingCat] = useState(null);

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAll = async () => {
    if (!selectedAccount) return;
    const [cRes, rRes] = await Promise.all([
      api.get(`/accounts/${selectedAccount.id}/categories`),
      api.get(`/accounts/${selectedAccount.id}/rules`),
    ]);
    setCategories(cRes.data);
    setRules(rRes.data);
    if (cRes.data.length > 0 && !ruleForm.category_id) {
      setRuleForm((f) => ({ ...f, category_id: cRes.data[0].id }));
    }
  };

  useEffect(() => { fetchAll(); }, [selectedAccount]);

  const handleAddCategory = async (e) => {
    e.preventDefault();
    setCatError("");
    try {
      await api.post(`/accounts/${selectedAccount.id}/categories`, { name: newCatName, color: newCatColor, is_income: newCatIsIncome, exclude_from_totals: newCatExclude });
      setNewCatName("");
      setNewCatColor("#6366f1");
      setNewCatIsIncome(false);
      setNewCatExclude(false);
      fetchAll();
    } catch (err) {
      setCatError(apiError(err, "Failed to create category."));
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Delete this category? All rules using it will also be deleted.")) return;
    await api.delete(`/accounts/${selectedAccount.id}/categories/${id}`);
    fetchAll();
  };

  const handleUpdateCat = async (cat) => {
    try {
      await api.patch(`/accounts/${selectedAccount.id}/categories/${cat.id}`, {
        name:                cat.name,
        color:               cat.color,
        is_income:           cat.is_income,
        exclude_from_totals: cat.exclude_from_totals,
      });
      setEditingCat(null);
      fetchAll();
    } catch (err) {
      setCatError(apiError(err, "Failed to update category."));
    }
  };

  const handleAddRule = async (e) => {
    e.preventDefault();
    setRuleError("");
    try {
      await api.post(`/accounts/${selectedAccount.id}/rules`, {
        category_id: ruleForm.category_id,
        pattern: ruleForm.pattern,
        match_type: ruleForm.match_type,
        priority: parseInt(ruleForm.priority, 10),
      });
      await api.post(`/accounts/${selectedAccount.id}/remap`);
      setRuleForm((f) => ({ ...f, pattern: "", priority: 0 }));
      fetchAll();
      fetchUnmappedCount();
    } catch (err) {
      setRuleError(apiError(err, "Failed to create rule."));
    }
  };

  const handleDeleteRule = async (id) => {
    await api.delete(`/accounts/${selectedAccount.id}/rules/${id}`);
    await api.post(`/accounts/${selectedAccount.id}/remap`);
    fetchAll();
    fetchUnmappedCount();
  };

  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editRuleForm, setEditRuleForm] = useState({ category_id: "", pattern: "", match_type: "contains", priority: 0 });
  const [editRuleError, setEditRuleError] = useState("");
  const [editRuleSaving, setEditRuleSaving] = useState(false);

  const startEditRule = (r) => {
    setEditingRuleId(r.id);
    setEditRuleForm({ category_id: r.category_id, pattern: r.pattern, match_type: r.match_type, priority: r.priority });
    setEditRuleError("");
  };

  const handleSaveRule = async (ruleId) => {
    setEditRuleError("");
    setEditRuleSaving(true);
    try {
      await api.patch(`/accounts/${selectedAccount.id}/rules/${ruleId}`, {
        category_id: editRuleForm.category_id,
        pattern:     editRuleForm.pattern,
        match_type:  editRuleForm.match_type,
        priority:    parseInt(editRuleForm.priority, 10),
      });
      await api.post(`/accounts/${selectedAccount.id}/remap`);
      setEditingRuleId(null);
      fetchAll();
      fetchUnmappedCount();
    } catch (err) {
      setEditRuleError(apiError(err, "Failed to update rule."));
    } finally {
      setEditRuleSaving(false);
    }
  };

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

  // Group rules by category_id
  const rulesByCategory = categories.map((cat) => ({
    cat,
    rules: rules.filter((r) => r.category_id === cat.id),
  })).filter(({ rules }) => rules.length > 0);

  const uncategorisedRules = rules.filter((r) => !catMap[r.category_id]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Rules & Categories</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">Categories</h2>
          {categories.length === 0 && (
            <p className="text-zinc-500 text-sm">No categories yet.</p>
          )}
          <ul className="space-y-1.5">
            {categories.map((c) => (
              <li key={c.id} className="bg-zinc-800 rounded px-3 py-2">
                {editingCat?.id === c.id ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={editingCat.color}
                        onChange={(e) => setEditingCat({ ...editingCat, color: e.target.value })}
                        className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                      />
                      <input
                        value={editingCat.name}
                        onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                        className="flex-1 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingCat.is_income}
                            onChange={(e) => setEditingCat({ ...editingCat, is_income: e.target.checked })}
                            className="accent-green-500"
                          />
                          Income category
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingCat.exclude_from_totals}
                            onChange={(e) => setEditingCat({ ...editingCat, exclude_from_totals: e.target.checked })}
                            className="accent-amber-500"
                          />
                          Exclude from totals
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateCat(editingCat)}
                          className="text-cyan-400 hover:text-cyan-300 text-xs transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCat(null)}
                          className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="text-sm">{c.name}</span>
                      {c.is_income && (
                        <span className="text-xs text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">income</span>
                      )}
                      {c.exclude_from_totals && (
                        <span className="text-xs text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">excluded</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingCat({ ...c })}
                        className="text-zinc-600 hover:text-cyan-400 text-xs transition-colors"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(c.id)}
                        className="text-zinc-600 hover:text-red-400 text-xs transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {catError && <p className="text-red-400 text-xs">{catError}</p>}
          <form onSubmit={handleAddCategory} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent flex-shrink-0"
                title="Pick category color"
              />
              <input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Category name"
                required
                className="flex-1 bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
              />
              <button
                type="submit"
                className="bg-cyan-500 hover:bg-cyan-400 text-white text-sm px-3 py-1.5 rounded transition-colors"
              >
                Add
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={newCatIsIncome}
                onChange={(e) => setNewCatIsIncome(e.target.checked)}
                className="accent-green-500"
              />
              Income category
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={newCatExclude}
                onChange={(e) => setNewCatExclude(e.target.checked)}
                className="accent-amber-500"
              />
              Exclude from totals
            </label>
          </form>
        </div>

        <div className="card p-5 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">New Mapping Rule</h2>
          {categories.length === 0 ? (
            <p className="text-yellow-400 text-sm">Create a category first.</p>
          ) : (
            <form onSubmit={handleAddRule} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Category</label>
                <select
                  value={ruleForm.category_id}
                  onChange={(e) => setRuleForm((f) => ({ ...f, category_id: e.target.value }))}
                  className="bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Match Type</label>
                <select
                  value={ruleForm.match_type}
                  onChange={(e) => setRuleForm((f) => ({ ...f, match_type: e.target.value }))}
                  className="bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
                >
                  <option value="exact">Exact</option>
                  <option value="starts_with">Starts With</option>
                  <option value="contains">Contains</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Pattern</label>
                <input
                  value={ruleForm.pattern}
                  onChange={(e) => setRuleForm((f) => ({ ...f, pattern: e.target.value }))}
                  placeholder="e.g. Netflix, AMZN, Grocery"
                  required
                  className="bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-zinc-400">Priority (higher = evaluated first)</label>
                <input
                  type="number"
                  value={ruleForm.priority}
                  onChange={(e) => setRuleForm((f) => ({ ...f, priority: e.target.value }))}
                  className="bg-white/[0.04] border border-white/[0.07] rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-400 w-24"
                />
              </div>
              {ruleError && <p className="text-red-400 text-xs">{ruleError}</p>}
              <button
                type="submit"
                className="bg-cyan-500 hover:bg-cyan-400 text-white text-sm px-4 py-2 rounded transition-colors"
              >
                Create Rule
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="card p-5 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide">
          Active Rules ({rules.length})
        </h2>
        {rules.length === 0 ? (
          <p className="text-zinc-500 text-sm">No rules yet. Rules auto-categorize transactions on import.</p>
        ) : (
          <div className="space-y-4">
            {[...rulesByCategory, ...(uncategorisedRules.length > 0 ? [{ cat: null, rules: uncategorisedRules }] : [])].map(({ cat, rules: catRules }) => (
              <div key={cat?.id ?? "uncategorised"}>
                {/* Category header */}
                <div className="flex items-center gap-2 mb-1.5">
                  {cat ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: cat.color }}>{cat.name}</span>
                    </>
                  ) : (
                    <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Unknown Category</span>
                  )}
                  <span className="text-xs text-zinc-600">({catRules.length})</span>
                </div>

                {/* Rules table for this category */}
                <div className="rounded border border-white/[0.06] overflow-hidden">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col className="w-28" />
                      <col />
                      <col className="w-16" />
                      <col className="w-20" />
                    </colgroup>
                    <thead>
                      <tr className="bg-white/[0.04] text-zinc-500 text-xs uppercase">
                        <th className="text-left px-3 py-1.5">Match Type</th>
                        <th className="text-left px-3 py-1.5">Pattern</th>
                        <th className="text-right px-3 py-1.5">Priority</th>
                        <th className="px-3 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {catRules.map((r) => (
                        editingRuleId === r.id ? (
                          <tr key={r.id} className="border-t border-white/[0.06] bg-white/[0.03]">
                            <td className="px-3 py-2">
                              <select
                                value={editRuleForm.match_type}
                                onChange={(e) => setEditRuleForm((f) => ({ ...f, match_type: e.target.value }))}
                                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              >
                                <option value="exact">Exact</option>
                                <option value="starts_with">Starts With</option>
                                <option value="contains">Contains</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={editRuleForm.pattern}
                                onChange={(e) => setEditRuleForm((f) => ({ ...f, pattern: e.target.value }))}
                                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs font-mono w-full focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                value={editRuleForm.priority}
                                onChange={(e) => setEditRuleForm((f) => ({ ...f, priority: e.target.value }))}
                                className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs w-16 text-right focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleSaveRule(r.id)}
                                  disabled={editRuleSaving}
                                  className="text-cyan-400 hover:text-cyan-300 text-xs disabled:opacity-50 transition-colors"
                                >
                                  {editRuleSaving ? "…" : "Save"}
                                </button>
                                <button
                                  onClick={() => { setEditingRuleId(null); setEditRuleError(""); }}
                                  className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                              {editRuleError && <p className="text-red-400 text-xs mt-1 text-right">{editRuleError}</p>}
                            </td>
                          </tr>
                        ) : (
                          <tr key={r.id} className="border-t border-white/[0.06] hover:bg-white/[0.02]">
                            <td className="px-3 py-2 text-zinc-400 capitalize text-xs">{r.match_type.replace("_", " ")}</td>
                            <td className="px-3 py-2 font-mono text-yellow-300 text-xs truncate">{r.pattern}</td>
                            <td className="px-3 py-2 text-right text-zinc-500 text-xs">{r.priority}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => startEditRule(r)}
                                  className="text-zinc-600 hover:text-cyan-400 text-xs transition-colors"
                                  title="Edit rule"
                                >
                                  ✎
                                </button>
                                <button
                                  onClick={() => handleDeleteRule(r.id)}
                                  className="text-zinc-600 hover:text-red-400 text-xs transition-colors"
                                  title="Delete rule"
                                >
                                  ✕
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
