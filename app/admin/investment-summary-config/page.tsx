"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2, Upload } from "lucide-react";

// ---------------------------------------------------------------------------
// This page is intentionally minimal: the Postgres-native investment summary
// calculator (app/lib/investment-summary/) reads these 4 hand-maintained
// CSVs straight off disk, no staging, no generate/publish step, no Python
// involved. An upload here validates + overwrites the file on the very next
// request — that's the whole flow.
// ---------------------------------------------------------------------------

interface FileInfo {
  filename: string;
  exists: boolean;
  modifiedAt: string | null;
}

interface ClientRow {
  icode: string;
  clientName: string;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InvestmentSummaryConfigPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Config file upload state
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileRef = useRef<string | null>(null);

  // Client selection + download state
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clientsLoading, setClientsLoading] = useState(false);
  type DownloadState = "idle" | "loading" | "done" | "error";
  const [dlState, setDlState] = useState<DownloadState>("idle");
  const [dlError, setDlError] = useState("");
  const [valState, setValState] = useState<DownloadState>("idle");
  const [valError, setValError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (status === "authenticated" && session?.user?.accessType !== "admin")
      router.push("/dashboard");
  }, [status, session, router]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/investment-summary/config-upload");
      if (res.ok) {
        const d = await res.json();
        setFiles(d.files ?? []);
      }
    } catch {
      /* transient */
    }
  }, []);

  const loadClients = useCallback(async () => {
    setClientsLoading(true);
    try {
      const res = await fetch("/api/admin/investment-summary/clients");
      if (res.ok) {
        const d = await res.json();
        const list: ClientRow[] = d.clients ?? [];
        setClients(list);
        setSelected(new Set(list.map((c) => c.icode)));
      }
    } catch {
      /* transient */
    } finally {
      setClientsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      refresh();
      loadClients();
    }
  }, [status, refresh, loadClients]);

  function pickFile(filename: string) {
    pendingFileRef.current = filename;
    fileInputRef.current?.click();
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    const expected = pendingFileRef.current;
    e.target.value = "";
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
      const res = await fetch("/api/admin/investment-summary/config-upload", {
        method: "POST",
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.details ?? d.error ?? `Server returned ${res.status}`);
      setBanner({ kind: "ok", text: `${expected} uploaded — takes effect on the very next request` });
      await refresh();
    } catch (err) {
      setBanner({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function toggleAll() {
    if (selected.size === clients.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(clients.map((c) => c.icode)));
    }
  }

  function toggleOne(icode: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(icode)) next.delete(icode);
      else next.add(icode);
      return next;
    });
  }

  async function downloadFrom(
    endpoint: string,
    filenamePrefix: string,
    extension: "zip" | "xlsx",
    setState: (s: DownloadState) => void,
    setErr: (s: string) => void,
  ) {
    if (selected.size === 0) return;
    setState("loading");
    setErr("");
    try {
      const icodes = Array.from(selected).join(",");
      const res = await fetch(`${endpoint}?icodes=${encodeURIComponent(icodes)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Server returned ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `${filenamePrefix}_${selected.size}_clients_${date}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setState("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  const handleDownload = () =>
    downloadFrom(
      "/api/admin/investment-summary/download-all",
      "investment_summary",
      "zip",
      setDlState,
      setDlError,
    );

  const handleValidationDownload = () =>
    downloadFrom(
      "/api/admin/investment-summary/validation-download",
      "cash_validation",
      "xlsx",
      setValState,
      setValError,
    );

  if (status === "loading" || status === "unauthenticated") return null;

  const allSelected = clients.length > 0 && selected.size === clients.length;
  const noneSelected = selected.size === 0;

  return (
    <div className="min-h-screen bg-primary-bg">
      <AdminHeader />
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChosen}
      />

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-card-text font-heading">
            Investment Summary Config
          </h1>
          <p className="text-sm text-card-text-secondary">
            Upload config files or download Investment Summary Excels for selected clients.
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

        {/* Config file upload */}
        <section className="bg-white/60 border border-card-text-secondary/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-logo-green" />
            <h2 className="text-lg font-semibold text-card-text">Config Files</h2>
          </div>

          <div className="space-y-1.5">
            {files.map((f) => (
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
                        `/api/admin/investment-summary/config-download?file=${encodeURIComponent(f.filename)}`,
                        "_blank",
                      )
                    }
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs bg-logo-green text-button-text hover:bg-logo-green/90 disabled:opacity-60"
                    disabled={busy}
                    onClick={() => pickFile(f.filename)}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Download Investment Summaries */}
        <section className="bg-white/60 border border-card-text-secondary/20 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Download className="h-5 w-5 text-logo-green" />
              <h2 className="text-lg font-semibold text-card-text">Download Investment Summaries</h2>
            </div>
            <span className="text-xs text-card-text-secondary">
              {selected.size} / {clients.length} selected
            </span>
          </div>

          {/* Client selection table */}
          {clientsLoading ? (
            <div className="flex items-center gap-2 text-sm text-card-text-secondary py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading clients…
            </div>
          ) : clients.length === 0 ? (
            <p className="text-sm text-card-text-secondary">
              No clients found in Master_Config.csv.
            </p>
          ) : (
            <div className="rounded-xl border border-card-text-secondary/20 overflow-hidden">
              {/* Header row */}
              <div className="flex items-center gap-3 px-3 py-2 bg-card-text/5 border-b border-card-text-secondary/20">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded accent-logo-green cursor-pointer"
                />
                <span className="text-xs font-medium text-card-text-secondary uppercase tracking-wide">
                  Client
                </span>
                <span className="ml-auto text-xs font-medium text-card-text-secondary uppercase tracking-wide">
                  icode
                </span>
              </div>

              {/* Scrollable rows */}
              <div className="max-h-72 overflow-y-auto divide-y divide-card-text-secondary/10">
                {clients.map((c) => (
                  <label
                    key={c.icode}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-white/70 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(c.icode)}
                      onChange={() => toggleOne(c.icode)}
                      className="h-4 w-4 rounded accent-logo-green cursor-pointer shrink-0"
                    />
                    <span className="text-sm text-card-text truncate">{c.clientName}</span>
                    <span className="ml-auto text-xs text-card-text-secondary font-mono shrink-0">
                      {c.icode}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Download result banner */}
          {dlState === "done" && (
            <div className="flex items-center gap-3 text-sm text-logo-green bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Download complete — saved to your downloads folder.
            </div>
          )}
          {dlState === "error" && (
            <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span><strong>Failed:</strong> {dlError}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleDownload}
              disabled={dlState === "loading" || noneSelected}
              className="bg-logo-green text-button-text hover:bg-logo-green/90 h-9 gap-1.5 text-sm disabled:opacity-60"
            >
              {dlState === "loading" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              ) : (
                <><Download className="h-4 w-4" />
                  {noneSelected
                    ? "Select clients to download"
                    : `Download ${selected.size} client${selected.size !== 1 ? "s" : ""}`}
                </>
              )}
            </Button>

            <Button
              onClick={handleValidationDownload}
              disabled={valState === "loading" || noneSelected}
              variant="outline"
              className="h-9 gap-1.5 text-sm disabled:opacity-60"
            >
              {valState === "loading" ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
              ) : (
                <><Download className="h-4 w-4" /> Cash Validation (consolidated)</>
              )}
            </Button>
          </div>

          {valState === "done" && (
            <div className="flex items-center gap-3 text-sm text-logo-green bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Cash validation download complete — saved to your downloads folder.
            </div>
          )}
          {valState === "error" && (
            <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span><strong>Failed:</strong> {valError}</span>
            </div>
          )}
          <p className="text-xs text-card-text-secondary">
            Cash Validation is a single consolidated Excel — one row per selected client with
            the cash reconciliation check, investment total, and current Zerodha value.
          </p>
        </section>
      </div>
    </div>
  );
}
