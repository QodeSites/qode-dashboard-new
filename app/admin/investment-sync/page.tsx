"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  RefreshCw,
  Rocket,
  Upload,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SyncJob {
  id: number;
  job_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
  report_date: string | null;
  error_message: string | null;
  result_json: unknown;
}

interface ValidationRow {
  client: string;
  date: string;
  cash_check: string;
  investment_total: string;
  zerodha_value: string;
  status: string;
}

interface FileInfo {
  filename: string;
  destination: "config" | "inputs";
  exists: boolean;
  modifiedAt: string | null;
}

interface StagingInfo {
  fileCount: number;
  manifest: {
    job_id: number | null;
    report_date?: string;
    finished?: string;
    generated_by?: string;
  } | null;
  publishable: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function duration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvestmentSyncPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [current, setCurrent] = useState<SyncJob | null>(null);
  const [lastGenerate, setLastGenerate] = useState<SyncJob | null>(null);
  const [staging, setStaging] = useState<StagingInfo | null>(null);
  const [history, setHistory] = useState<SyncJob[]>([]);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [reportDate, setReportDate] = useState(todayStr());
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, forceTick] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileRef = useRef<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (status === "authenticated" && session?.user?.accessType !== "admin")
      router.push("/dashboard");
  }, [status, session, router]);

  const refresh = useCallback(async () => {
    try {
      const [statusRes, filesRes] = await Promise.all([
        fetch("/api/admin/sync/status"),
        fetch("/api/admin/sync/upload"),
      ]);
      if (statusRes.ok) {
        const d = await statusRes.json();
        setCurrent(d.current);
        setLastGenerate(d.lastGenerate);
        setStaging(d.staging ?? null);
        setHistory(d.history ?? []);
      }
      if (filesRes.ok) {
        const d = await filesRes.json();
        setFiles(d.files ?? []);
      }
    } catch {
      /* transient network error — next poll retries */
    }
  }, []);

  // Initial load
  useEffect(() => {
    if (status === "authenticated") refresh();
  }, [status, refresh]);

  // Poll every 3s while a job runs (+ tick each second for elapsed display)
  const isRunning = current?.status === "running";
  useEffect(() => {
    if (!isRunning) return;
    const poll = setInterval(refresh, 3000);
    const tick = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [isRunning, refresh]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  async function handleGenerate() {
    setBanner(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sync/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportDate }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Server returned ${res.status}`);
      setBanner({ kind: "ok", text: `Generation started (job #${d.jobId})` });
      await refresh();
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (!confirm("Push the validated reports to live? Clients will see them immediately.")) return;
    setBanner(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sync/publish", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `Server returned ${res.status}`);
      setBanner({ kind: "ok", text: `Published ${d.fileCount} files to live` });
      await refresh();
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  function pickFile(filename: string) {
    pendingFileRef.current = filename;
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    const expected = pendingFileRef.current;
    e.target.value = ""; // allow re-choosing the same file
    if (!chosen || !expected) return;

    if (chosen.name !== expected) {
      setBanner({
        kind: "err",
        text: `Expected '${expected}' but you selected '${chosen.name}'. Rename the file or pick the matching one.`,
      });
      return;
    }

    setBanner(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", chosen);
      const res = await fetch("/api/admin/sync/upload", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.details ?? d.error ?? `Server returned ${res.status}`);
      setBanner({
        kind: "ok",
        text: `${expected} uploaded${d.backedUpTo ? ` (previous version backed up)` : ""}`,
      });
      await refresh();
    } catch (err) {
      setBanner({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  // Publishable when staging holds a manifest-verified set. Server-generated
  // sets additionally need the last generate job to have succeeded; local
  // manual runs (manifest.job_id === null) only need the staging files.
  const stagingFromServerJob = staging?.manifest?.job_id != null;
  const canPublish =
    !isRunning &&
    !busy &&
    !!staging?.publishable &&
    (!stagingFromServerJob || lastGenerate?.status === "success");

  const validationRows: ValidationRow[] = Array.isArray(lastGenerate?.result_json)
    ? (lastGenerate!.result_json as ValidationRow[])
    : [];

  const configFiles = files.filter((f) => f.destination === "config");
  const inputFiles = files.filter((f) => f.destination === "inputs");

  if (status === "loading" || status === "unauthenticated") return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-primary-bg">
      <AdminHeader />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.yaml,.xlsx"
        className="hidden"
        onChange={handleFileChosen}
      />

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-card-text font-heading">
            Investment Summary Sync
          </h1>
          <p className="text-sm text-card-text-secondary">
            Upload weekly input sheets, generate &amp; validate reports, then push them live.
          </p>
        </div>

        {banner && (
          <div
            className={`flex items-start gap-3 text-sm rounded-xl px-4 py-3 border ${
              banner.kind === "ok"
                ? "text-logo-green bg-green-50 border-green-200"
                : "text-red-700 bg-red-50 border-red-200"
            }`}
          >
            {banner.kind === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            )}
            <span>{banner.text}</span>
          </div>
        )}

        {/* Running job banner */}
        {isRunning && current && (
          <div className="flex items-center gap-3 text-sm text-card-text bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>
              <strong>{current.job_type === "generate" ? "Generation" : "Publish"}</strong>{" "}
              running for {duration(current.started_at, null)} — started by{" "}
              {current.triggered_by} at {fmtDateTime(current.started_at)}. Uploads and new
              runs are locked.
            </span>
          </div>
        )}

        {/* ── 1. Files ─────────────────────────────────────────────── */}
        <section className="bg-white/60 border border-card-text-secondary/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-logo-green" />
            <h2 className="text-lg font-semibold text-card-text">
              Config &amp; Input Sheets
            </h2>
          </div>

          {[
            { label: "Config Files", list: configFiles },
            { label: "Input Files (weekly)", list: inputFiles },
          ].map(({ label, list }) => (
            <div key={label} className="space-y-1.5">
              <p className="text-xs font-medium uppercase tracking-wide text-card-text-secondary">
                {label}
              </p>
              {list.map((f) => (
                <div
                  key={f.filename}
                  className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-white/70 border border-card-text-secondary/10"
                >
                  <div className="min-w-0">
                    <span className="text-sm text-card-text font-mono">{f.filename}</span>
                    <span className="ml-3 text-xs text-card-text-secondary">
                      {f.exists ? `Last updated: ${fmtDateTime(f.modifiedAt)}` : "Not on server yet"}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      disabled={!f.exists}
                      onClick={() =>
                        window.open(
                          `/api/admin/sync/download?file=${encodeURIComponent(f.filename)}`,
                          "_blank",
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-xs bg-logo-green text-button-text hover:bg-logo-green/90 disabled:opacity-60"
                      disabled={isRunning || busy}
                      onClick={() => pickFile(f.filename)}
                    >
                      <Upload className="h-3.5 w-3.5" /> Upload
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {isRunning && (
            <p className="text-xs text-amber-700">
              Uploads are disabled while a job is running.
            </p>
          )}
        </section>

        {/* ── 2. Generate & Validate ───────────────────────────────── */}
        <section className="bg-white/60 border border-card-text-secondary/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-logo-green" />
            <h2 className="text-lg font-semibold text-card-text">Generate &amp; Validate</h2>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-card-text-secondary mb-1">Report date</label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                disabled={isRunning || busy}
                className="h-10 rounded-lg border border-card-text-secondary/30 bg-white px-3 text-sm text-card-text"
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isRunning || busy}
              className="h-10 bg-logo-green text-button-text hover:bg-logo-green/90 gap-2 disabled:opacity-60"
            >
              {isRunning && current?.job_type === "generate" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Running…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" /> Generate &amp; Validate
                </>
              )}
            </Button>
          </div>

          {/* Last generate outcome */}
          {lastGenerate && lastGenerate.status !== "running" && (
            <div
              className={`flex items-start gap-3 text-sm rounded-xl px-4 py-3 border ${
                lastGenerate.status === "success"
                  ? "text-logo-green bg-green-50 border-green-200"
                  : "text-red-700 bg-red-50 border-red-200"
              }`}
            >
              {lastGenerate.status === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              )}
              <div>
                <p>
                  Last generation <strong>{lastGenerate.status}</strong> —{" "}
                  {fmtDateTime(lastGenerate.started_at)} (
                  {duration(lastGenerate.started_at, lastGenerate.finished_at)}) for report
                  date {lastGenerate.report_date ?? "—"}
                </p>
                {lastGenerate.error_message && (
                  <p className="mt-1 text-xs whitespace-pre-wrap">{lastGenerate.error_message}</p>
                )}
              </div>
            </div>
          )}

          {/* Validation results */}
          {validationRows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-card-text-secondary border-b border-card-text-secondary/20">
                    <th className="py-2 pr-3">Client</th>
                    <th className="py-2 pr-3">Data date</th>
                    <th className="py-2 pr-3">Cash check</th>
                    <th className="py-2 pr-3">Investment total</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {validationRows.map((r, i) => (
                    <tr key={i} className="border-b border-card-text-secondary/10">
                      <td className="py-1.5 pr-3 text-card-text">{r.client}</td>
                      <td className="py-1.5 pr-3 text-card-text-secondary">{r.date}</td>
                      <td className="py-1.5 pr-3 text-card-text-secondary">{r.cash_check}</td>
                      <td className="py-1.5 pr-3 text-card-text-secondary">
                        {r.investment_total}
                      </td>
                      <td className="py-1.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            r.status === "SUCCESS"
                              ? "bg-green-100 text-logo-green"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Push to Live */}
          <div className="pt-2 border-t border-card-text-secondary/10 space-y-2">
            {staging && staging.fileCount > 0 && (
              <p className="text-xs text-card-text-secondary">
                Staging: {staging.fileCount} files
                {staging.manifest?.report_date && ` · report date ${staging.manifest.report_date}`}
                {staging.manifest
                  ? staging.manifest.job_id != null
                    ? ` · from job #${staging.manifest.job_id}`
                    : " · from a local manual run"
                  : " · no manifest (regenerate before publishing)"}
                {" — you're reviewing this set; clients still see the previous live reports."}
              </p>
            )}
            <Button
              onClick={handlePublish}
              disabled={!canPublish}
              className="h-10 gap-2 bg-logo-green text-button-text hover:bg-logo-green/90 disabled:opacity-50"
            >
              <Rocket className="h-4 w-4" /> Push to Live
            </Button>
            {!canPublish && !isRunning && (
              <p className="text-xs text-card-text-secondary">
                {!staging || staging.fileCount === 0
                  ? "Nothing in staging yet — run a generation first."
                  : !staging.manifest
                    ? "Staging has no manifest — regenerate before publishing."
                    : "Enabled after a successful generation."}
              </p>
            )}
          </div>
        </section>

        {/* ── 3. History ───────────────────────────────────────────── */}
        <section className="bg-white/60 border border-card-text-secondary/20 rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-semibold text-card-text">Job History</h2>
          {history.length === 0 ? (
            <p className="text-sm text-card-text-secondary">No jobs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-card-text-secondary border-b border-card-text-secondary/20">
                    <th className="py-2 pr-3">#</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Started</th>
                    <th className="py-2 pr-3">Duration</th>
                    <th className="py-2">By</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((j) => (
                    <tr key={j.id} className="border-b border-card-text-secondary/10">
                      <td className="py-1.5 pr-3 text-card-text-secondary">{j.id}</td>
                      <td className="py-1.5 pr-3 text-card-text">{j.job_type}</td>
                      <td className="py-1.5 pr-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            j.status === "success"
                              ? "bg-green-100 text-logo-green"
                              : j.status === "running"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-card-text-secondary">
                        {fmtDateTime(j.started_at)}
                      </td>
                      <td className="py-1.5 pr-3 text-card-text-secondary">
                        {duration(j.started_at, j.finished_at)}
                      </td>
                      <td className="py-1.5 text-card-text-secondary">{j.triggered_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
