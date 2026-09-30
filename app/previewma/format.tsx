import React from "react";

export type AmtStyle =
  | "cr"      
  | "auto"
  | "signed"     
  | "signed-lakh" 
  | "rupee0";     

const CR = 1e7;
const LAKH = 1e5;


export function fmtFull(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const abs = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}₹${abs}`;
}

export function fmtAmt(v: number | null | undefined, style: AmtStyle = "auto"): string {
  if (v === null || v === undefined || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const neg = v < 0;
  switch (style) {
    case "cr":
      return `₹${(v / CR).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
    case "auto": {
      const s = neg ? "-" : "";
      if (abs >= CR) return `${s}₹${(abs / CR).toFixed(2)} Cr`;
      if (abs >= LAKH) return `${s}₹${(abs / LAKH).toFixed(2)} L`;
      return `${s}₹${Math.round(abs).toLocaleString("en-IN")}`;
    }
    case "signed": {
      const s = neg ? "-" : "+";
      if (abs >= CR) return `${s}₹${(abs / CR).toFixed(2)}Cr`;
      if (abs >= LAKH) return `${s}₹${(abs / LAKH).toFixed(2)}L`;
      return `${s}₹${Math.round(abs).toLocaleString("en-IN")}`;
    }
    case "signed-lakh": {
      const s = neg ? "-" : "+";
      return abs >= CR ? `${s}₹${(abs / CR).toFixed(2)}Cr` : `${s}₹${(abs / LAKH).toFixed(2)}L`;
    }
    case "rupee0":
      return `${neg ? "-" : ""}₹${Math.round(abs).toLocaleString("en-IN")}`;
  }
}


export function Amt({
  v, style = "auto", className,
}: { v: number | null | undefined; style?: AmtStyle; className?: string }) {
  if (v === null || v === undefined || !isFinite(v)) return <span className={className}>—</span>;
  return <span className={className} title={fmtFull(v)}>{fmtAmt(v, style)}</span>;
}