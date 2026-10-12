import React from "react";

/*
 * Mobile helpers for the transaction tables (Dashboard + Review).
 * On small screens the table collapses to Description + Amount + ✎, with the
 * date and category underneath the description, and editing happens in a
 * stacked form spanning the whole row instead of five cramped inputs.
 */

export function CategoryChip({ txn, catMap }) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {txn.category_id ? (() => {
        const cat = catMap[txn.category_id];
        return cat ? (
          <span
            className="text-xs px-2 py-0.5 rounded font-medium"
            style={{ backgroundColor: `${cat.color}30`, color: cat.color, border: `1px solid ${cat.color}60` }}
          >
            {cat.name}
          </span>
        ) : (
          <span className="bg-violet-900/50 text-cyan-300 text-xs px-2 py-0.5 rounded">mapped</span>
        );
      })() : (
        <span className="bg-yellow-900/50 text-yellow-300 text-xs px-2 py-0.5 rounded">unmapped</span>
      )}
      {txn.is_manual && (
        <span
          className="text-xs text-zinc-500 bg-white/[0.04] border border-white/[0.07] px-1 py-0.5 rounded"
          title="Manually assigned — protected from auto-remap"
        >
          M
        </span>
      )}
    </span>
  );
}

/** Date + category line shown under the description on mobile only. */
export function MobileTxnMeta({ txn, catMap }) {
  return (
    <div className="sm:hidden mt-1 flex items-center gap-2 flex-wrap text-xs text-zinc-500">
      <span>{txn.date}</span>
      <CategoryChip txn={txn} catMap={catMap} />
    </div>
  );
}

const field = "w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm " +
              "focus:outline-none focus:ring-1 focus:ring-cyan-400";

/** Stacked edit form — rendered in a full-width cell on mobile only. */
export function MobileTxnEditCell({ colSpan, editForm, setEditForm, categories, onSave, onCancel, onDelete, saving }) {
  const set = (k) => (e) => setEditForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <td colSpan={colSpan} className="sm:hidden py-3">
      <div className="space-y-2">
        <input value={editForm.raw_description} onChange={set("raw_description")}
          placeholder="Description" className={field} />
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={editForm.date} onChange={set("date")} className={field} />
          <input type="number" step="0.01" inputMode="decimal" value={editForm.amount}
            onChange={set("amount")} className={`${field} font-mono text-right`} />
        </div>
        <select value={editForm.category_id} onChange={set("category_id")} className={field}>
          <option value="">— unmapped —</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-2 pt-1">
          <button onClick={onSave} disabled={saving}
            className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-white text-sm py-2 rounded-lg">
            Save
          </button>
          <button onClick={onCancel}
            className="flex-1 bg-white/[0.05] text-zinc-300 text-sm py-2 rounded-lg">
            Cancel
          </button>
          <button onClick={onDelete}
            className="px-3 text-red-400 text-sm py-2 rounded-lg bg-red-900/20">
            Delete
          </button>
        </div>
      </div>
    </td>
  );
}
