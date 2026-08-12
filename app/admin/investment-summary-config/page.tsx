"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Download, FileUp, Upload } from "lucide-react";

// ---------------------------------------------------------------------------
// This page is intentionally minimal: the Postgres-native investment summary
// calculator (app/lib/investment-summary/) reads these 4 hand-maintained
// CSVs straight off disk, no staging, no generate/publish step, no Python
// involved. An upload here validates + overwrites the file on the very next
// request — that's the whole flow. Kept fully separate from
// /admin/investment-sync (the legacy Python PDF pipeline's Generate &
// Publish page — still real, still needed for per-strategy PDFs, but a
// wholly different system with its own job-running/staging state that has
// nothing to do with these config files).
// ---------------------------------------------------------------------------

interface FileInfo {
  filename: string;
  exists: boolean;
  modifiedAt: string | null;
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

  const [files, setFiles] = useState<FileInfo[]>([]);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingFileRef = useRef<string | null>(null);

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
      /* transient network error */
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") refresh();
  }, [status, refresh]);

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

  if (status === "loading" || status === "unauthenticated") return null;

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
            Upload a file and it replaces what&apos;s there — nothing else happens.
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

        <p className="text-center text-xs text-card-text-secondary">
          Looking for the legacy PDF report pipeline?{" "}
          <Link href="/admin/investment-sync" className="text-logo-green underline">
            Investment Summary Sync →
          </Link>
        </p>
      </div>
    </div>
  );
}
