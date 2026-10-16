"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Pencil, Trash2, X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type DataType = "string" | "number" | "float" | "boolean";

interface GlobalConfigEntry {
  key: string;
  value: string;
  data_type: DataType;
  updated_by: string | null;
  updated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

async function apiFetchConfigs(): Promise<GlobalConfigEntry[]> {
  const res = await fetch("/api/internal/settings/global-config", { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load configs (${res.status})`);
  return res.json();
}
async function apiCreateConfig(entry: { key: string; value: string; data_type: DataType }) {
  const res = await fetch("/api/internal/settings/global-config", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Failed to create config (${res.status})`);
  }
  return res.json();
}
async function apiUpdateConfig(key: string, value: string) {
  const res = await fetch(`/api/internal/settings/global-config/${encodeURIComponent(key)}`, {
    method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Failed to update config (${res.status})`);
  }
  return res.json();
}
async function apiDeleteConfig(key: string) {
  const res = await fetch(`/api/internal/settings/global-config/${encodeURIComponent(key)}?confirmed=true`, {
    method: "DELETE", credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `Failed to delete config (${res.status})`);
  }
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

function DataTypeBadge({ type }: { type: DataType }) {
  const styles: Record<DataType, string> = {
    string: "bg-blue-50 text-blue-700 border-blue-200",
    number: "bg-purple-50 text-purple-700 border-purple-200",
    float: "bg-indigo-50 text-indigo-700 border-indigo-200",
    boolean: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[type]}`}>
      {type}
    </span>
  );
}

function SmallModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-xl border border-logo-green/10 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between bg-logo-green px-5 py-3 rounded-t-xl">
          <span className="text-sm font-bold text-white">{title}</span>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Create / Edit form ─────────────────────────────────────────────────────

function ConfigForm({
  mode, initial, onSubmit, onCancel,
}: {
  mode: "create" | "edit";
  initial?: GlobalConfigEntry;
  onSubmit: (entry: { key: string; value: string; data_type: DataType }) => Promise<void>;
  onCancel: () => void;
}) {
  const [key, setKey] = useState(initial?.key ?? "");
  const [value, setValue] = useState(initial?.value ?? "");
  const [dataType, setDataType] = useState<DataType>(initial?.data_type ?? "string");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyValid = mode === "edit" || /^[A-Za-z0-9_.-]+$/.test(key.trim());
  const canSubmit = key.trim().length > 0 && value.trim().length > 0 && keyValid;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ key: key.trim(), value: value.trim(), data_type: dataType });
    } catch (e: any) {
      setError(e?.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Key</span>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={mode === "edit"}
          placeholder="e.g. withdrawal_max_amount"
          className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 disabled:bg-primary-bg/30 disabled:text-card-text-secondary"
        />
        {mode === "create" && !keyValid && key.length > 0 && (
          <p className="mt-1 text-xs text-red-600">Key can only contain letters, numbers, underscores, dots, and hyphens.</p>
        )}
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Data Type</span>
        <select
          value={dataType}
          onChange={(e) => setDataType(e.target.value as DataType)}
          disabled={mode === "edit"}
          className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white disabled:bg-primary-bg/30 disabled:text-card-text-secondary"
        >
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="float">float</option>
          <option value="boolean">boolean</option>
        </select>
        {mode === "edit" && (
          <p className="mt-1 text-xs text-card-text-secondary">Key and data type can't be changed after creation.</p>
        )}
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-card-text-secondary mb-1.5">Value</span>
        {dataType === "boolean" ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white"
          >
            <option value="">Select…</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : (
          <input
            type={dataType === "number" || dataType === "float" ? "number" : "text"}
            step={dataType === "float" ? "any" : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Value"
            className="w-full px-3 py-2 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40"
          />
        )}
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button" onClick={onCancel}
          className="rounded-lg border border-logo-green/20 px-4 py-2 text-sm text-card-text-secondary hover:bg-primary-bg/40 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button" onClick={handleSubmit} disabled={!canSubmit || saving}
          className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-4 py-2 text-sm font-medium text-white hover:bg-logo-green/90 transition-colors disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? "Saving…" : mode === "create" ? "Create" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Delete confirmation ────────────────────────────────────────────────────

function DeleteConfirm({
  entry, onConfirm, onCancel,
}: {
  entry: GlobalConfigEntry;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e: any) {
      setError(e?.message || "Failed to delete.");
      setDeleting(false);
    }
  }

  return (
    <SmallModal title="Delete Config" onClose={onCancel}>
      <div className="space-y-4">
        <div className="flex items-start gap-2 text-sm text-card-text">
          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <span>
            Delete <span className="font-mono font-semibold">{entry.key}</span>? This can't be undone.
          </span>
        </div>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button" onClick={onCancel}
            className="rounded-lg border border-logo-green/20 px-4 py-2 text-sm text-card-text-secondary hover:bg-primary-bg/40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button" onClick={handleConfirm} disabled={deleting}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </SmallModal>
  );
}

// ─── Main modal ─────────────────────────────────────────────────────────────

export function GlobalConfigModal({ onClose }: { onClose: () => void }) {
  const [configs, setConfigs] = useState<GlobalConfigEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<GlobalConfigEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<GlobalConfigEntry | null>(null);

  async function loadConfigs() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchConfigs();
      setConfigs(data);
    } catch (e: any) {
      setError(e?.message || "Failed to load configs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConfigs();
  }, []);

  function flashSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return configs;
    const q = search.toLowerCase();
    return configs.filter((c) => c.key.toLowerCase().includes(q));
  }, [configs, search]);

  async function handleCreate(entry: { key: string; value: string; data_type: DataType }) {
    await apiCreateConfig(entry);
    setCreateOpen(false);
    flashSuccess(`Created "${entry.key}"`);
    await loadConfigs();
  }

  async function handleEdit(entry: { key: string; value: string; data_type: DataType }) {
    await apiUpdateConfig(entry.key, entry.value);
    setEditEntry(null);
    flashSuccess(`Updated "${entry.key}"`);
    await loadConfigs();
  }

  async function handleDelete() {
    if (!deleteEntry) return;
    await apiDeleteConfig(deleteEntry.key);
    const deletedKey = deleteEntry.key;
    setDeleteEntry(null);
    flashSuccess(`Deleted "${deletedKey}"`);
    await loadConfigs();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-primary-bg rounded-2xl border border-logo-green/10 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-logo-green px-6 py-4 flex-shrink-0">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/60 mb-0.5">Admin</div>
            <span className="font-serif text-lg text-white">Global Config</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {successMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {successMsg}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-card-text-secondary" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by key…"
                className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-logo-green/20 outline-none focus:border-logo-green/40 bg-white"
              />
            </div>
            <button
              type="button" onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-logo-green px-4 py-2.5 text-sm font-medium text-white hover:bg-logo-green/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Config
            </button>
          </div>

          <div className="bg-white rounded-xl border border-logo-green/10 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-card-text-secondary">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading configs…
              </div>
            ) : error ? (
              <div className="flex items-start gap-3 px-5 py-4 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                {error}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-card-text-secondary italic text-center py-16">
                {search ? "No configs match your search." : "No configs found."}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-primary-bg/40 text-card-text-secondary text-xs border-b border-logo-green/10">
                    <th className="px-4 py-2.5 text-left font-medium">Key</th>
                    <th className="px-4 py-2.5 text-left font-medium">Value</th>
                    <th className="px-4 py-2.5 text-left font-medium">Data Type</th>
                    <th className="px-4 py-2.5 text-left font-medium">Updated By</th>
                    <th className="px-4 py-2.5 text-left font-medium">Updated At</th>
                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.key} className="border-t border-logo-green/5 hover:bg-primary-bg/20 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-card-text whitespace-nowrap">{c.key}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-card-text-secondary max-w-xs truncate">{c.value}</td>
                      <td className="px-4 py-2.5"><DataTypeBadge type={c.data_type} /></td>
                      <td className="px-4 py-2.5 text-xs text-card-text-secondary whitespace-nowrap">{c.updated_by || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-card-text-secondary whitespace-nowrap">{fmtDate(c.updated_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button" onClick={() => setEditEntry(c)}
                            className="p-1.5 rounded-md text-card-text-secondary hover:bg-primary-bg/60 hover:text-logo-green transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button" onClick={() => setDeleteEntry(c)}
                            className="p-1.5 rounded-md text-card-text-secondary hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {createOpen && (
        <SmallModal title="New Config" onClose={() => setCreateOpen(false)}>
          <ConfigForm mode="create" onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} />
        </SmallModal>
      )}

      {editEntry && (
        <SmallModal title={`Edit "${editEntry.key}"`} onClose={() => setEditEntry(null)}>
          <ConfigForm mode="edit" initial={editEntry} onSubmit={handleEdit} onCancel={() => setEditEntry(null)} />
        </SmallModal>
      )}

      {deleteEntry && (
        <DeleteConfirm entry={deleteEntry} onConfirm={handleDelete} onCancel={() => setDeleteEntry(null)} />
      )}
    </div>
  );
}