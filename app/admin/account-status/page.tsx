"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface StrategyRow {
  strategy: string;
  closed: boolean;
  closedDate: string | null;
  notes: string | null;
}
interface AccountRow {
  qcode: string;
  accountName: string | null;
  broker: string | null;
  strategies: StrategyRow[];
}

export default function AccountStatusPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyClosed, setOnlyClosed] = useState(false);
  const [dates, setDates] = useState<Record<string, string>>({});

  const [unlocked, setUnlocked] = useState(false);
  const [entryPassword, setEntryPassword] = useState("");
  const [entryError, setEntryError] = useState("");
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
    else if (status === "authenticated" && session?.user?.accessType !== "admin") router.push("/dashboard");
  }, [status, session, router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/account-status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setAccounts(data.accounts);
      setError(null);
    } catch {
      setError("Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked && status === "authenticated" && session?.user?.accessType === "admin") load();
  }, [unlocked, status, session, load]);

  const handleUnlock = async () => {
    setEntrySubmitting(true);
    setEntryError("");
    try {
      const res = await fetch("/api/admin/account-status/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: entryPassword }),
      });
      if (!res.ok) {
        setEntryError("Incorrect password");
      } else {
        setUnlocked(true);
      }
    } catch {
      setEntryError("Something went wrong");
    }
    setEntrySubmitting(false);
  };

  const update = async (qcode: string, s: StrategyRow, closed: boolean) => {
    const key = `${qcode}|${s.strategy}`;
    setSaving(key);
    try {
      const res = await fetch("/api/admin/account-status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qcode,
          strategy: s.strategy,
          closed,
          closedDate: closed ? dates[key] || s.closedDate || null : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      setDates((d) => {
        const next = { ...d };
        delete next[key];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (onlyClosed && !a.strategies.some((s) => s.closed)) return false;
      if (!q) return true;
      return a.qcode.toLowerCase().includes(q) || (a.accountName ?? "").toLowerCase().includes(q);
    });
  }, [accounts, search, onlyClosed]);

  if (status !== "authenticated" || session?.user?.accessType !== "admin") return null;

  return (
    <div className="min-h-screen bg-primary-bg px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/admin")}
          className="gap-2 text-card-text-secondary hover:text-logo-green"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Admin
        </Button>
        <h1 className="text-2xl font-heading font-bold text-logo-green">Account Status</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-logo-green/20 bg-white/70 px-4 py-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or qcode"
          type="search"
          name="account-status-search"
          autoComplete="off"
          className="h-8 w-64 border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
        />
        <div className="flex items-center gap-2">
          <Switch
            id="only-closed"
            checked={onlyClosed}
            onCheckedChange={setOnlyClosed}
            className="data-[state=checked]:bg-logo-green data-[state=unchecked]:bg-card-text-secondary/30"
          />
          <Label htmlFor="only-closed" className="text-xs text-card-text-secondary">
            Only accounts with a closed strategy
          </Label>
        </div>
        <span className="ml-auto text-sm text-card-text-secondary">{filtered.length} accounts</span>
      </div>

      <Dialog open={!unlocked}>
        <DialogContent
          className="sm:max-w-sm border-logo-green/20 bg-primary-bg [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-card-text font-heading text-xl">Enter Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-card-text-secondary">Enter the admin password to continue.</p>
            <div className="space-y-1.5">
              <Label htmlFor="entry-password" className="text-card-text text-xs font-medium">Password</Label>
              <Input
                id="entry-password"
                type="password"
                value={entryPassword}
                onChange={(e) => { setEntryPassword(e.target.value); setEntryError(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && entryPassword) handleUnlock(); }}
                placeholder="Enter password"
                className="border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
                autoFocus
              />
              {entryError && <p className="text-xs text-red-600 mt-1">{entryError}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleUnlock}
              disabled={entrySubmitting || !entryPassword}
              className="bg-logo-green text-button-text hover:bg-logo-green/90 w-full"
            >
              {entrySubmitting ? "Verifying..." : "Unlock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="border rounded-lg overflow-x-auto bg-white/50">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-card-text-secondary">Loading accounts...</div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>QCode</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-center whitespace-nowrap">Closed</TableHead>
                <TableHead>Closed date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a) =>
                a.strategies.map((s, i) => {
                  const key = `${a.qcode}|${s.strategy}`;
                  return (
                    <TableRow key={key} className={s.closed ? "bg-logo-green/5" : undefined}>
                      <TableCell className="font-medium text-card-text">
                        {i === 0 && (
                          <>
                            {a.accountName ?? "-"}
                            {a.broker && (
                              <div className="text-xs font-normal text-card-text-secondary">{a.broker}</div>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell>
                        {i === 0 && (
                          <Badge variant="outline" className="text-xs">
                            {a.qcode}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-card-text">{s.strategy}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={`text-xs font-medium ${s.closed ? "text-logo-green" : "text-card-text-secondary"}`}
                          >
                            {s.closed ? "On" : "Off"}
                          </span>
                          <Switch
                            checked={s.closed}
                            disabled={saving === key}
                            onCheckedChange={(checked) => update(a.qcode, s, checked)}
                            className="data-[state=checked]:bg-logo-green data-[state=unchecked]:bg-card-text-secondary/30"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={dates[key] ?? s.closedDate ?? ""}
                          onChange={(e) => setDates((d) => ({ ...d, [key]: e.target.value }))}
                          onBlur={() => {
                            if (s.closed && dates[key] !== undefined && dates[key] !== (s.closedDate ?? ""))
                              update(a.qcode, s, true);
                          }}
                          className="h-8 w-40 border-logo-green/20 bg-white focus-visible:ring-logo-green/30"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
