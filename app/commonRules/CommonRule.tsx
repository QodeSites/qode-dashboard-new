

"use client";

import {fmtPct,fmtInr, ReturnDisplay} from "./commonRule"


export function DualValue({ pct, inr }: { pct: number | null; inr: number | null }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className={pct !== null && pct < 0 ? "text-red-600 font-semibold" : "text-green-700 font-semibold"}>
        {fmtPct(pct)}
      </span>
      <span className="text-[10px] text-card-text-secondary">{fmtInr(inr)}</span>
    </div>
  );
}

export function ReturnMetricCell({
  display, absoluteInr, xirrInr,
}: {
  display: ReturnDisplay;
  absoluteInr: number | null;
  xirrInr: number | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-card-text-secondary">
          {display.primaryLabel}
        </span>
        <DualValue pct={display.primaryPct} inr={display.primaryLabel === "XIRR" ? xirrInr : absoluteInr} />
      </div>
      {display.primaryLabel === "XIRR" && (
        <div className="flex items-center justify-between gap-2 opacity-70">
          <span className="text-[10px] uppercase tracking-wide text-card-text-secondary">Absolute</span>
          <DualValue pct={display.absolutePct} inr={absoluteInr} />
        </div>
      )}
      {display.xirrUnavailableNote && (
        <p className="text-[9px] text-card-text-secondary italic" title={display.xirrUnavailableNote}>
          XIRR: — (&lt;1yr history)
        </p>
      )}
    </div>
  );
}
export function DrawdownCells({
  sinceInceptionAbsPct, sinceInceptionInr, maxDdPct, currentDdPct,
}: {
  sinceInceptionAbsPct: number; sinceInceptionInr: number;
  maxDdPct: number; currentDdPct: number;
}) {
  return (
    <>
      <td className="px-3 py-2 text-right">
        <DualValue pct={sinceInceptionAbsPct} inr={sinceInceptionInr} />
      </td>
      <td className="px-3 py-2 text-right text-red-600 font-semibold">{fmtPct(maxDdPct)}</td>
      <td className="px-3 py-2 text-right text-red-600 font-semibold">{fmtPct(currentDdPct)}</td>
    </>
  );
}