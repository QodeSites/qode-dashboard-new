"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const METHODS = ["GET", "POST", "PATCH", "DELETE"] as const;
type Method = (typeof METHODS)[number];

interface QueryParam {
  key: string;
  value: string;
}

interface PresetField {
  key: string;
  label: string;
  placeholder?: string;
  /** "json" fields are parsed from raw text into a JSON value; omitted from the body if left blank. */
  type?: "text" | "number" | "json";
  /** Pre-filled whenever this preset is selected, so common fields (e.g. qcode) don't need retyping. */
  defaultValue?: string;
}

interface Preset {
  id: string;
  label: string;
  method: Method;
  url: string;
  fields: PresetField[];
}

const OVERRIDES_FIELD: PresetField = {
  key: "overrides",
  label: "Overrides (JSON, optional — request-scoped only, never persisted)",
  placeholder: '{"QAW++":{"cashPct":0.5}}',
  type: "json",
};

const QCODE_FIELD: PresetField = {
  key: "qcode",
  label: "Qcode",
  placeholder: "QAC00071",
  defaultValue: "QAC00071",
};

/**
 * TEMPORARY -- pins the mastersheet read to a historical date, for verifying
 * against frozen managed_accounts_analysis Excels. Remove this field (and
 * the backing asOfDate plumbing in the routes/lib) once that verification
 * is done; not meant to be a permanent feature.
 */
const AS_OF_DATE_FIELD: PresetField = {
  key: "asOfDate",
  label: "As-of date (optional, YYYY-MM-DD — TEMPORARY, for Excel verification)",
  placeholder: "2026-07-22",
};

/**
 * Stands in for Python's live/manual Nifty ATM figure -- drives Put
 * Protection's contractValue (= niftyLtp * niftyLotSize). Without it, Put
 * Protection falls back to 0. niftyLotSize itself comes from
 * global_config.NIFTY_LOT_SIZE, not this field.
 */
const NIFTY_LTP_FIELD: PresetField = {
  key: "niftyLtp",
  label: "NIFTY LTP (required for Put Protection to compute — e.g. spot at as-of date)",
  placeholder: "29250",
  type: "number",
};

/** Field keys that carry their last-typed value forward across preset switches, instead of resetting to defaultValue every time. */
const STICKY_FIELD_KEYS = new Set(["qcode", "asOfDate", "niftyLtp"]);

const PRESETS: Preset[] = [
  { id: "custom", label: "Custom request", method: "GET", url: "", fields: [] },
  {
    id: "account-summary",
    label: "Cash & Margin — Account Summary",
    method: "POST",
    url: "/api/internal/cash-margin/account-summary",
    fields: [QCODE_FIELD, AS_OF_DATE_FIELD],
  },
  {
    id: "system-breakup",
    label: "Cash & Margin — System Breakup",
    method: "POST",
    url: "/api/internal/cash-margin/system-breakup",
    fields: [QCODE_FIELD, OVERRIDES_FIELD, AS_OF_DATE_FIELD],
  },
  {
    id: "margin-requirements",
    label: "Cash & Margin — Margin Requirements",
    method: "POST",
    url: "/api/internal/cash-margin/margin-requirements",
    fields: [QCODE_FIELD, OVERRIDES_FIELD, AS_OF_DATE_FIELD, NIFTY_LTP_FIELD],
  },
  {
    id: "inputs",
    label: "Cash & Margin — Inputs (P2 §2f)",
    method: "POST",
    url: "/api/internal/cash-margin/inputs",
    fields: [QCODE_FIELD, OVERRIDES_FIELD, AS_OF_DATE_FIELD],
  },
  {
    id: "page2",
    label: "Cash & Margin — Page 2 (ALL of §2b–§2f combined)",
    method: "POST",
    url: "/api/internal/cash-margin/page2",
    fields: [QCODE_FIELD, OVERRIDES_FIELD, AS_OF_DATE_FIELD, NIFTY_LTP_FIELD],
  },
  {
    id: "debt-equity",
    label: "Cash & Margin — Debt to Equity",
    method: "POST",
    url: "/api/internal/cash-margin/debt-equity",
    fields: [QCODE_FIELD, OVERRIDES_FIELD, AS_OF_DATE_FIELD],
  },
  {
    id: "top-bar",
    label: "Cash & Margin — Top Bar",
    method: "POST",
    url: "/api/internal/cash-margin/top-bar",
    fields: [QCODE_FIELD, OVERRIDES_FIELD, AS_OF_DATE_FIELD],
  },
  {
    id: "alerts",
    label: "Cash & Margin — Alerts",
    method: "POST",
    url: "/api/internal/cash-margin/alerts",
    fields: [OVERRIDES_FIELD, AS_OF_DATE_FIELD],
  },
  {
    id: "client-registry",
    label: "Cash & Margin — Client Registry (P1)",
    method: "POST",
    url: "/api/internal/cash-margin/client-registry",
    fields: [OVERRIDES_FIELD, AS_OF_DATE_FIELD],
  },
  {
    id: "client-list",
    label: "Cash & Margin — Client List",
    method: "GET",
    url: "/api/internal/cash-margin/client-list",
    fields: [],
  },
  {
    id: "withdrawal",
    label: "Cash & Margin — Withdrawal",
    method: "POST",
    url: "/api/internal/cash-margin/withdrawal",
    fields: [
      QCODE_FIELD,
      { key: "strategy", label: "Strategy", placeholder: "QAW++" },
      { key: "amount", label: "Amount", placeholder: "100000", type: "number" },
      { key: "equity_pct", label: "Equity % override (optional)", type: "number" },
      { key: "cash_pct", label: "Cash % override (optional)", type: "number" },
      { key: "liquidcase_pct", label: "Liquidcase % override (optional)", type: "number" },
    ],
  },
];

/** Appends non-empty-key query params onto the base path, respecting any `?` already in it. */
function buildRequestUrl(basePath: string, params: QueryParam[]): string {
  const active = params.filter((p) => p.key.trim());
  if (active.length === 0) return basePath;
  const qs = new URLSearchParams();
  for (const p of active) qs.set(p.key.trim(), p.value);
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}${qs.toString()}`;
}

/** Builds a JSON request body from preset field values, dropping blank fields entirely. */
function buildBodyFromFields(fields: PresetField[], values: Record<string, string>): string {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (raw === undefined || raw.trim() === "") continue;
    if (f.type === "json") {
      try {
        body[f.key] = JSON.parse(raw);
      } catch {
        // Leave invalid JSON out rather than sending garbage; user sees it in the raw-body preview.
      }
    } else if (f.type === "number") {
      const n = Number(raw);
      if (!Number.isNaN(n)) body[f.key] = n;
    } else {
      body[f.key] = raw;
    }
  }
  return Object.keys(body).length ? JSON.stringify(body, null, 2) : "";
}

/** Renders any JSON value as nested tables where possible, falling back to plain text for scalars. */
function JsonValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-card-text-secondary italic">null</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-card-text-secondary italic">[]</span>;
    }
    const allObjects = value.every(
      (v) => v !== null && typeof v === "object" && !Array.isArray(v),
    );
    if (allObjects) {
      const columns = Array.from(
        new Set(value.flatMap((row) => Object.keys(row as Record<string, unknown>))),
      );
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="border border-logo-green/20 bg-logo-green/10 px-2 py-1 text-left font-medium text-card-text"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.map((row, i) => (
                <tr key={i} className={i % 2 ? "bg-white/40" : "bg-white/70"}>
                  {columns.map((col) => (
                    <td key={col} className="border border-logo-green/10 px-2 py-1 align-top text-card-text">
                      <JsonValue value={(row as Record<string, unknown>)[col]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <ul className="list-disc pl-4 space-y-0.5">
        {value.map((v, i) => (
          <li key={i}>
            <JsonValue value={v} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-card-text-secondary italic">{"{}"}</span>;
    }
    return (
      <table className="w-full text-xs border-collapse">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td className="border border-logo-green/10 bg-logo-green/5 px-2 py-1 align-top font-medium text-card-text whitespace-nowrap">
                {k}
              </td>
              <td className="border border-logo-green/10 px-2 py-1 align-top text-card-text">
                <JsonValue value={v} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (typeof value === "boolean") {
    return <span className={value ? "text-logo-green" : "text-red-600"}>{String(value)}</span>;
  }
  return <span className="font-mono">{String(value)}</span>;
}

export default function ApiTesterPage() {
  const { status } = useSession();
  const router = useRouter();

  const initialPreset = PRESETS.find((p) => p.id === "top-bar")!;
  const [presetId, setPresetId] = useState("top-bar");
  const [method, setMethod] = useState<Method>("POST");
  const [url, setUrl] = useState("/api/internal/cash-margin/top-bar");
  const [queryParams, setQueryParams] = useState<QueryParam[]>([{ key: "", value: "" }]);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {};
    for (const f of initialPreset.fields) defaults[f.key] = f.defaultValue ?? "";
    return defaults;
  });
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [response, setResponse] = useState("");
  const [parsedResponse, setParsedResponse] = useState<unknown>(undefined);
  const [viewMode, setViewMode] = useState<"table" | "json">("table");
  const [error, setError] = useState("");

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  const isCustom = preset.id === "custom";

  useEffect(() => {
    if (!isCustom) {
      setBody(buildBodyFromFields(preset.fields, fieldValues));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldValues, presetId]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-primary-bg flex items-center justify-center">
        <div className="text-logo-green text-xl font-heading">Loading...</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/");
    return null;
  }

  const requestUrl = isCustom ? buildRequestUrl(url, queryParams) : url;

  const selectPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
    setPresetId(id);
    setMethod(p.method);
    setUrl(p.url);
    const next: Record<string, string> = {};
    for (const f of p.fields) {
      const carried = STICKY_FIELD_KEYS.has(f.key) ? fieldValues[f.key] : undefined;
      next[f.key] = carried || f.defaultValue || "";
    }
    setFieldValues(next);
    setBody(p.id === "custom" ? "" : buildBodyFromFields(p.fields, next));
  };

  const updateField = (key: string, value: string) =>
    setFieldValues((prev) => ({ ...prev, [key]: value }));

  const updateParam = (index: number, field: keyof QueryParam, value: string) => {
    setQueryParams((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const addParam = () => setQueryParams((prev) => [...prev, { key: "", value: "" }]);

  const removeParam = (index: number) =>
    setQueryParams((prev) => prev.filter((_, i) => i !== index));

  const handleSend = async () => {
    setLoading(true);
    setError("");
    setResponse("");
    setParsedResponse(undefined);
    setStatusCode(null);
    try {
      const init: RequestInit = {
        method,
        credentials: "include",
      };
      if (method !== "GET" && method !== "DELETE" && body.trim()) {
        init.headers = { "Content-Type": "application/json" };
        init.body = body;
      } else if (method === "DELETE" && body.trim()) {
        init.headers = { "Content-Type": "application/json" };
        init.body = body;
      }

      const res = await fetch(requestUrl, init);
      setStatusCode(res.status);
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        setResponse(JSON.stringify(parsed, null, 2));
        setParsedResponse(parsed);
      } catch {
        setResponse(text);
        setParsedResponse(undefined);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-bg px-6 py-6 space-y-6">
      <h1 className="text-2xl font-heading font-bold text-logo-green">
        Admin API Tester
      </h1>
      <p className="text-sm text-card-text-secondary">
        Sends requests from your browser session (cookie-based auth) — no API key needed.
      </p>

      <div className="border rounded-lg bg-white/50 p-4 space-y-4 max-w-3xl">
        <div className="space-y-1.5">
          <Label className="text-card-text text-xs font-medium">Request type</Label>
          <Select value={presetId} onValueChange={selectPreset}>
            <SelectTrigger className="border-logo-green/20 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-3">
          <div className="w-32 space-y-1.5">
            <Label className="text-card-text text-xs font-medium">Method</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as Method)}
              disabled={!isCustom}
            >
              <SelectTrigger className="border-logo-green/20 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-card-text text-xs font-medium">URL (path only, no query string)</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/api/internal/cash-margin/top-bar"
              readOnly={!isCustom}
              className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
            />
          </div>
        </div>

        {isCustom && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-card-text text-xs font-medium">Query Parameters</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addParam}
                className="h-7 text-xs border-logo-green/20"
              >
                + Add parameter
              </Button>
            </div>
            <div className="space-y-2">
              {queryParams.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={p.key}
                    onChange={(e) => updateParam(i, "key", e.target.value)}
                    placeholder="key (e.g. qcode)"
                    className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
                  />
                  <Input
                    value={p.value}
                    onChange={(e) => updateParam(i, "value", e.target.value)}
                    placeholder="value (e.g. QAC00071)"
                    className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeParam(i)}
                    disabled={queryParams.length === 1}
                    className="shrink-0 border-logo-green/20 text-card-text-secondary"
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-xs font-mono text-card-text-secondary break-all pt-1">
              {requestUrl}
            </p>
          </div>
        )}

        {!isCustom && preset.fields.length > 0 && (
          <div className="space-y-3">
            {preset.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label className="text-card-text text-xs font-medium">{f.label}</Label>
                {f.type === "json" ? (
                  <Textarea
                    value={fieldValues[f.key] ?? ""}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    rows={3}
                    className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30 font-mono text-xs"
                  />
                ) : (
                  <Input
                    value={fieldValues[f.key] ?? ""}
                    onChange={(e) => updateField(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    type={f.type === "number" ? "number" : "text"}
                    className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {!isCustom && !!body && (
          <details className="text-xs text-card-text-secondary">
            <summary className="cursor-pointer select-none">Raw request body preview</summary>
            <pre className="mt-1 border rounded bg-white/50 p-2 font-mono whitespace-pre-wrap">{body}</pre>
          </details>
        )}

        {isCustom && method !== "GET" && (
          <div className="space-y-1.5">
            <Label className="text-card-text text-xs font-medium">
              Request Body (JSON)
            </Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{"qcode": "ABC123", "strategy": "QYE++", ...}'
              rows={8}
              className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30 font-mono text-sm"
            />
          </div>
        )}

        <Button
          onClick={handleSend}
          disabled={loading || !requestUrl}
          className="bg-logo-green text-button-text hover:bg-logo-green/90"
        >
          {loading ? "Sending..." : "Send Request"}
        </Button>
      </div>

      {error && (
        <div className="max-w-3xl border border-red-300 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {(response || statusCode !== null) && (
        <div className="max-w-4xl space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-card-text">Status:</span>
              <span
                className={`text-sm font-mono ${
                  statusCode && statusCode >= 200 && statusCode < 300
                    ? "text-logo-green"
                    : "text-red-600"
                }`}
              >
                {statusCode}
              </span>
            </div>
            {parsedResponse !== undefined && (
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "table" ? "default" : "outline"}
                  onClick={() => setViewMode("table")}
                  className={
                    viewMode === "table"
                      ? "h-7 text-xs bg-logo-green text-button-text"
                      : "h-7 text-xs border-logo-green/20"
                  }
                >
                  Table
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={viewMode === "json" ? "default" : "outline"}
                  onClick={() => setViewMode("json")}
                  className={
                    viewMode === "json"
                      ? "h-7 text-xs bg-logo-green text-button-text"
                      : "h-7 text-xs border-logo-green/20"
                  }
                >
                  Raw JSON
                </Button>
              </div>
            )}
          </div>

          {parsedResponse !== undefined && viewMode === "table" ? (
            <div className="border rounded-lg bg-white/50 p-4 overflow-auto max-h-[600px]">
              <JsonValue value={parsedResponse} />
            </div>
          ) : (
            <pre className="border rounded-lg bg-white/50 p-4 text-xs font-mono overflow-auto max-h-[600px] whitespace-pre-wrap text-card-text">
              {response}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
