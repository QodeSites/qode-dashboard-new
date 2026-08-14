"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

type State = "idle" | "loading" | "done" | "error";
type Stage = "dashboard" | "holdings";

export default function DownloadAllExcelsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [state, setState]       = useState<State>("idle");
  const [stage, setStage]       = useState<Stage>("dashboard");
  const [progress, setProgress] = useState(0);      // 0-100 animated estimate per stage
  const [elapsed, setElapsed]   = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef    = useRef(0);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    if (status === "authenticated" && session?.user?.accessType !== "admin") router.push("/dashboard");
  }, [status, session, router]);

  function startTimers() {
    startRef.current = Date.now();
    setElapsed(0);
    setProgress(0);

    // Elapsed counter
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    // Animated progress bar — slow fill that never quite reaches 100%
    // It accelerates at first then slows down, so it feels responsive
    // without lying about completion.
    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev + 0.05;   // crawl near the end
        if (prev >= 70) return prev + 0.3;
        if (prev >= 40) return prev + 0.8;
        return prev + 1.5;
      });
    }, 300);
  }

  function stopTimers() {
    if (timerRef.current)    clearInterval(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
  }

  // Fetch one zip and trigger a browser download.
  async function fetchAndSave(url: string, filename: string) {
    const res = await fetch(url);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? `Server returned ${res.status}`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  }

  async function handleDownload() {
    setState("loading");
    setErrorMsg("");
    const date = new Date().toISOString().slice(0, 10);

    // ── Stage 1: dashboard ────────────────────────────────────────────────
    setStage("dashboard");
    startTimers();
    try {
      await fetchAndSave(
        "/api/admin/download-all-excels/dashboard",
        `qode_dashboard_excels_${date}.zip`
      );
      setProgress(100);
    } catch (e) {
      stopTimers();
      setErrorMsg(`Dashboard: ${e instanceof Error ? e.message : String(e)}`);
      setState("error");
      return;
    }
    stopTimers();

    // ── Stage 2: holdings ─────────────────────────────────────────────────
    setStage("holdings");
    startTimers();
    try {
      await fetchAndSave(
        "/api/admin/download-all-excels/holdings",
        `qode_holdings_excels_${date}.zip`
      );
      setProgress(100);
      setState("done");
    } catch (e) {
      setErrorMsg(`Holdings: ${e instanceof Error ? e.message : String(e)}`);
      setState("error");
    } finally {
      stopTimers();
    }
  }

  if (status === "loading" || status === "unauthenticated") return null;

  const isLoading = state === "loading";

  return (
    <div className="min-h-screen bg-primary-bg">
      <AdminHeader />

      <div className="max-w-xl mx-auto px-4 py-16 space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-logo-green/10 mb-2">
            <FileSpreadsheet className="h-7 w-7 text-logo-green" />
          </div>
          <h1 className="text-2xl font-bold text-card-text font-heading">
            Download All Client Excels
          </h1>
          <p className="text-sm text-card-text-secondary">
            Generates two zips sequentially
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/60 border border-card-text-secondary/20 rounded-2xl p-8 space-y-6">

          {/* Progress bar — visible only while loading */}
          {isLoading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-card-text-secondary">
                <span>Step {stage === "dashboard" ? "1/2 — Dashboard" : "2/2 — Holdings"} Excels…</span>
                <span>{Math.min(Math.floor(progress), 99)}%</span>
              </div>
              <div className="h-2 w-full bg-card-text-secondary/15 rounded-full overflow-hidden">
                <div
                  className="h-full bg-logo-green rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progress, 99)}%` }}
                />
              </div>
              <p className="text-xs text-card-text-secondary text-right">{elapsed}s elapsed</p>
            </div>
          )}

          {/* Done */}
          {state === "done" && (
            <div className="flex items-center gap-3 text-sm text-logo-green bg-green-50 border border-green-200 rounded-xl px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Both zips downloaded (dashboard + holdings). Check your downloads folder.
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span><strong>Failed:</strong> {errorMsg}</span>
            </div>
          )}

          {/* Button */}
          <Button
            onClick={handleDownload}
            disabled={isLoading}
            className="w-full bg-logo-green text-button-text hover:bg-logo-green/90 h-11 text-sm font-medium gap-2 disabled:opacity-60"
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            ) : (
              <><Download className="h-4 w-4" /> {state === "done" ? "Download Again" : "Download All Excels"}</>
            )}
          </Button>

          {/* Note */}
          <p className="text-xs text-card-text-secondary text-center">
            Admin only · Files include all strategies per client · Benchmark columns will be blank
          </p>
        </div>
      </div>
    </div>
  );
}
