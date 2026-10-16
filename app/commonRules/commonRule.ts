export interface ReturnInputs {
  inceptionDate: string; 
  asOfDate: string; 
  absoluteReturnPct: number; 
  xirrPct: number | null; 
}

export interface ReturnDisplay {
  periodYears: number;
  usesXirr: boolean;
  primaryLabel: "XIRR" | "Absolute";
  primaryPct: number | null;
  absolutePct: number;
  xirrPct: number | null; 
  xirrUnavailableNote: string | null;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

export function computeReturnDisplay(inputs: ReturnInputs): ReturnDisplay {
  const inception = new Date(inputs.inceptionDate).getTime();
  const asOf = new Date(inputs.asOfDate).getTime();
  const periodYears = (asOf - inception) / MS_PER_YEAR;
  const usesXirr = periodYears >= 1;

  return {
    periodYears,
    usesXirr,
    primaryLabel: usesXirr ? "XIRR" : "Absolute",
    primaryPct: usesXirr ? inputs.xirrPct : inputs.absoluteReturnPct,
    absolutePct: inputs.absoluteReturnPct, 
    xirrPct: usesXirr ? inputs.xirrPct : null,
    xirrUnavailableNote: usesXirr
      ? null
      : `Less than 1 year of history (${periodYears.toFixed(1)}y) — XIRR not applicable, showing absolute return.`,
  };
}

export function fmtInr(v: number | null | undefined, decimals = 2) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(decimals)} Cr`;
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(decimals)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}
export function fmtPct(v: number | null | undefined, decimals = 2) {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}