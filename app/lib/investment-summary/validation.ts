/**
 * Port of calculations.py's calc_validation_summary (doc 02, doc 04
 * "validation.ts") — 5 checks, internal-only (not surfaced to clients
 * today per doc 02, but useful during Phase 2's parallel-diff verification
 * and worth keeping as a real function rather than ad-hoc scripts).
 */
import type { StrategySummary } from "./strategy-summaries";

export interface ValidationCheck {
  checkName: string;
  value: number;
  status: "PASS" | "FAIL";
  remarks: string;
}

/**
 * Runs all 5 checks from doc 02 against one strategy's (or the combined
 * "Total Portfolio"'s) computed summary. `missingInputFiles`/`missingSystemTags`
 * are supplied by the caller (index.ts), since detecting them requires
 * knowledge this module doesn't have (which config files were expected,
 * which tags were resolved with `matchedNonZero: false` across the report).
 */
export function calcValidationSummary(
  summary: StrategySummary,
  missingInputFiles: string[] = [],
  missingSystemTags: string[] = [],
): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // 1. Cash Reconciliation: abs(overview_cash.check) < 1.0
  if (summary.overviewCashSummary) {
    const checkRow = summary.overviewCashSummary.rows.find((r) => r.label === "Check");
    const value = checkRow?.amount ?? 0;
    checks.push({
      checkName: "Cash Reconciliation",
      value,
      status: Math.abs(value) < 1.0 ? "PASS" : "FAIL",
      remarks: Math.abs(value) < 1.0 ? "Reconciled" : `Off by ${value.toFixed(2)}`,
    });
  } else {
    checks.push({
      checkName: "Cash Reconciliation",
      value: 0,
      status: "PASS",
      remarks: "No overview cash summary for this strategy (inactive — nothing to reconcile)",
    });
  }

  // 2. Investment Summary Total: abs(holdings + cash - total) < 0.01
  const { holdings, cash, total } = summary.amountInvested;
  const totalDiff = holdings + cash - total;
  checks.push({
    checkName: "Investment Summary Total",
    value: totalDiff,
    status: Math.abs(totalDiff) < 0.01 ? "PASS" : "FAIL",
    remarks: Math.abs(totalDiff) < 0.01 ? "Matches" : `Off by ${totalDiff.toFixed(2)}`,
  });

  // 3. Account Summary %: abs(holdingsPct + liquidPct + cashPct - 100) < 0.01
  if (summary.currentAccountSummary.length > 0) {
    const pctSum = summary.currentAccountSummary.reduce((sum, row) => sum + row.percent, 0);
    const pctDiff = pctSum - 100;
    checks.push({
      checkName: "Account Summary %",
      value: pctDiff,
      status: Math.abs(pctDiff) < 0.01 ? "PASS" : "FAIL",
      remarks: Math.abs(pctDiff) < 0.01 ? "Sums to 100%" : `Sums to ${pctSum.toFixed(2)}%`,
    });
  } else {
    checks.push({
      checkName: "Account Summary %",
      value: 0,
      status: "PASS",
      remarks: "No account summary for this strategy (inactive)",
    });
  }

  // 4. Missing Input Files: len(missing_files) == 0
  checks.push({
    checkName: "Missing Input Files",
    value: missingInputFiles.length,
    status: missingInputFiles.length === 0 ? "PASS" : "FAIL",
    remarks: missingInputFiles.length === 0 ? "All present" : `Missing: ${missingInputFiles.join(", ")}`,
  });

  // 5. Missing System Tags: len(missing_tags) == 0
  checks.push({
    checkName: "Missing System Tags",
    value: missingSystemTags.length,
    status: missingSystemTags.length === 0 ? "PASS" : "FAIL",
    remarks: missingSystemTags.length === 0 ? "All resolved" : `Missing: ${missingSystemTags.join(", ")}`,
  });

  return checks;
}
