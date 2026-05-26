# How to add a new bifurcated client

This runbook covers onboarding a new client whose data lives in
`bifurcated_master_sheet_test`. It assumes Dinesh / Arwani / Ashwin are
already in the registry as reference examples.

## Prerequisites

1. The data team has sent the client's scheme/tag spec, e.g.:

   > Mangesh Hirve
   >
   > Scheme QAW++
   > For profit and exposure both - QAW++ Zerodha Total Portfolio
   >
   > Scheme QYE++
   > For profit - QYE++ Total Portfolio Value and exposure - QYE++ Zerodha Total Portfolio

2. The data team has populated `bifurcated_master_sheet_test` for the
   client's qcode, including a `Qode Total Portfolio` row for each date.

3. You know the client's qcode (e.g. `QAC00091`).

## Steps

### Step 1 — Run the investigation script

```bash
npx tsx scripts/investigate-bifurcated-client.ts QAC00091 "Mangesh"
```

The script outputs:
- Confirmed `icode`, `qcode`, account name from the `clients` / `accounts` /
  `pooled_account_users` tables.
- Each scheme detected via the `<PREFIX>++ Zerodha Total Portfolio` pattern,
  with its `MIN(date)` (= inception).
- Confirmation that `Qode Total Portfolio` data is present.
- A **paste-ready config block** for `app/lib/clients/<name>.ts`.
- A **paste-ready registry entry** for `bifurcated-clients-registry.ts`.

### Step 2 — Create the client config file

Save the config block to a new file, e.g. `app/lib/clients/mangesh.ts`.

Fill in the two `<FILL_FROM_DATA_TEAM>` placeholders for each scheme using
the data team's message:
- `exposure` is the tag they listed for **exposure**.
- `profit` is the tag they listed for **profit**.

If both fields are the same tag (as in "for profit and exposure both"),
just paste the same string for both.

### Step 3 — Append the registry entry

Open `app/lib/bifurcated-clients-registry.ts` and append the entry to the
`BIFURCATED_CLIENTS` array. Also add the import at the top:

```ts
import { MANGESH_CONFIG } from "./clients/mangesh";
```

### Step 4 — Validate

```bash
npx tsx scripts/validate-bifurcated-registry.ts
```

Must exit `0` with `✓ Registry valid`. If it fails:
- "icode NOT in clients table" — wrong icode; double-check with the script
  output from Step 1.
- "inception differs from DB MIN" — wrong inception date; re-run Step 1 and
  copy the dates verbatim.
- "Qode Total Portfolio MISSING" — data team has not populated this tag
  yet; coordinate with them before continuing.

### Step 5 — Build and commit

```bash
npm run build
git add app/lib/clients/mangesh.ts app/lib/bifurcated-clients-registry.ts
git commit -m "feat(bifurcated): add client Mangesh Hirve"
```

## What this WILL automatically work

- Dashboard recognizes the new icode and renders the three views (Total
  Portfolio, plus each declared scheme).
- `/api/bifurcated-portfolio?qcode=<qcode>` returns the portfolio JSON.
- `/api/bifurcated-holdings?qcode=<qcode>` returns the holdings JSON.
- Holdings page recognizes the new client and shows their equity + MF
  holdings with strategy filtering.

## What you do NOT need to touch

- `app/dashboard/page.tsx` — reads the registry; no ternary updates required.
- `app/holding-summary/page.tsx` — same.
- `app/lib/bifurcated-portfolio-utils.ts` — engine class internals unchanged.
- The legacy per-client routes — none are created for new clients.
- The `BifurcatedPortfolioEngine` class — no instances declared explicitly;
  the registry's `engineByQcode` map creates them automatically.

## When to use the verbose `ClientConfig` instead of `defineBifurcatedClient`

The helper covers the dominant "multi-parallel-active-schemes + Qode Total
Portfolio aggregate" pattern. If the new client has an inactive scheme
(like Dinesh's QTF), the helper does not model that — write a verbose
`ClientConfig` directly, modeled on `app/lib/clients/dinesh.ts`.

## Script runner: tsx vs ts-node

Both scripts use `npx tsx` (NOT `npx ts-node`). The project's tsconfig
uses `moduleResolution: "bundler"` (Next.js 15 default) which `ts-node`
does not handle correctly when scripts import project code. `tsx` works
out of the box. Install on demand via `npx tsx` (downloads automatically
if not present).

## Database safety

All scripts and the new routes are READ-ONLY per `CLAUDE.md`. None of the
operations introduced for this client onboarding create, update, delete, or
upsert any data. If you find yourself wanting to modify the DB to make
something work, you are off the happy path — talk to the data team instead.
