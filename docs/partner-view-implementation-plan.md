# Partner View — Implementation Plan

> New role **`partner`** + route **`/partner`**: a distribution partner with a book of
> specific clients they can impersonate (exactly like admin does today), plus a
> partner-specific landing page (scoped client list + aggregated book view + restricted data).
>
> The legacy `distributor` role/route (hardcoded `live@qodeinvest.com`, QYE+/QYE++/QAW++
> strategy-showcase pages, `app/lib/distributor-utils.ts`) is **left completely untouched**.
> We build a brand-new namespace so nothing collides.

Branch: `feature/distributor-view`

---

## Key facts this plan relies on (from codebase exploration)

- **`accessType` is the entire role model** — `admin | internal | distributor | client`, carried
  in the NextAuth JWT. We add a 5th value: `partner`. There is no separate roles table.
- **Impersonation today is admin-only and is NOT a JWT flow** (CLAUDE.md's "JWT internal
  impersonation" note is stale; `jsonwebtoken` is unused). It works via NextAuth
  `updateSession({ impersonating })`. The JWT callback in
  `app/api/auth/[...nextauth]/route.ts` writes `token.impersonating` **only if
  `accessType === "admin"`**.
- **Single server-side identity chokepoint:** `getEffectiveIcode(session)` in
  `app/lib/admin-utils.ts` — returns `impersonating.icode` for admins, else `session.user.icode`.
- **Account access resolves via** `getUserQcodes(icode)` in `app/lib/portfolio-utils.ts:957`
  (`pooled_account_users` OR `pooled_account_allocations`). The partner book maps by **icode**
  so it lines up 1:1 with impersonation; account roll-ups derive per client via `getUserQcodes`.
- **No in-app UI writes access grants today** — they are created directly in the DB. The partner
  book tables will likewise be team-populated.

## ⚠️ The one non-negotiable security rule

Admin impersonation is safe because an admin may impersonate **anyone**. A partner may impersonate
**only clients in their book**. But `updateSession(...)` sends the `impersonating` payload from the
**client side**, and the NextAuth JWT callback **cannot hit the DB**. Therefore:

> **Every server request reachable by a partner must independently re-verify, against the DB,
> that the impersonated icode is inside that partner's book.** Never trust `token.impersonating`
> for a partner the way we trust it for an admin.

This is enforced by `getEffectiveIcodeChecked()` (new, async) + `partnerCanAccessIcode()` below,
which every partner-reachable data endpoint must call.

---

## Phase 1 — Data model (`prisma/schema.prisma`)

Two new team-populated tables. App reads only (never writes) per the DB safety rules.

**Decision: keep the FK relation to `clients` (Option A).** The `partner_clients partner_clients[]`
field on `clients` is a Prisma-required opposite side of the `@relation` below — it's a **virtual
field (no DB column added to `clients`)**. We keep it for (a) DB-level integrity on the
hand-populated mapping table (rejects non-existent icodes) and (b) one-query joins in Phase 5
(`include: { clients: true }`). The alternative (drop the relation, plain `icode String`, join in
app code) was considered and rejected.

Add a back-relation on `clients`:

```prisma
model clients {
  // ...existing fields...
  password                   String?
  partner_clients            partner_clients[]   // <-- add
  pooled_account_allocations pooled_account_allocations[]
  pooled_account_users       pooled_account_users[]

  @@schema("public")
}
```

Add the two models:

```prisma
model partners {
  id              Int               @id @default(autoincrement())
  email           String            @unique
  password        String
  name            String
  active          Boolean           @default(true)
  created_at      DateTime          @default(now())
  updated_at      DateTime          @default(now()) @updatedAt
  partner_clients partner_clients[]

  @@schema("public")
}

model partner_clients {
  id         Int      @id @default(autoincrement())
  partner_id Int
  icode      String
  created_at DateTime @default(now())
  clients    clients  @relation(fields: [icode], references: [icode])
  partners   partners @relation(fields: [partner_id], references: [id], onDelete: Cascade)

  @@unique([partner_id, icode])
  @@index([partner_id])
  @@schema("public")
}
```

Then (when the dev server is stopped so the query-engine DLL isn't locked):

```bash
npx prisma generate      # regenerate client types (prisma.partners / prisma.partner_clients)
npx prisma db push       # team-triggered; creates the tables
```

> Note: the compound unique gives Prisma the key `partner_id_icode` used in `findUnique` below.
> Partner passwords will be stored plaintext to match the existing `clients` login pattern
> (`user.password !== credentials.password`). If hashing is desired, do it here and in Phase 2.

---

## Phase 2 — Auth & session

### 2a. `types/next-auth.d.ts`
Add `"partner"` to the `accessType` union in all three interfaces (`User`, `Session.user`, `JWT`),
add `partnerId?: string`, and fix the `impersonating` type to the real runtime shape (object):

```ts
type AccessType = "admin" | "internal" | "distributor" | "partner" | "client";

interface Impersonation { icode: string; name: string; email: string; }

// User:    accessType?: AccessType;  partnerId?: string;
// Session.user: accessType?: AccessType; partnerId?: string; impersonating?: Impersonation | null;
// JWT:     accessType?: AccessType;  partnerId?: string; impersonating?: Impersonation | null;
```

### 2b. `app/api/auth/[...nextauth]/route.ts`

**Add a partner branch in `authorize()`** — placed *before* the "Regular client auth" block so
partner emails resolve to the partner role:

```ts
// Partner (distributor) credentials — DB-backed via `partners` table.
const partner = await prisma.partners.findFirst({
  where: { email: identifierLower, active: true },
});
if (partner && partner.password === credentials.password) {
  return {
    id: partner.id.toString(),
    name: partner.name,
    email: partner.email,
    accessType: "partner",
    partnerId: partner.id.toString(),
  };
}
```

**Carry `partnerId` and extend the impersonation gate** in the `jwt` callback:

```ts
if (user) {
  token.icode = user.icode;
  token.name = user.name;
  token.email = user.email;
  token.accessType = user.accessType || "client";
  token.partnerId = user.partnerId;                 // <-- add
}
// admin + partner may set impersonating in the token; partner is RE-VERIFIED server-side.
if (trigger === "update" && session?.impersonating !== undefined) {
  if (token.accessType === "admin" || token.accessType === "partner") {   // <-- add partner
    token.impersonating = session.impersonating;
  }
}
```

**Expose `partnerId`** in the `session` callback:

```ts
session.user.partnerId = token.partnerId;            // <-- add
```

### 2c. `app/page.tsx` (post-login router)
Route partners to `/partner`:

```ts
if (accessType === "admin") router.replace("/dashboard");
if (accessType === "distributor") router.replace("/distributor");
if (accessType === "partner") router.replace("/partner");        // <-- add
```

And extend the "Redirecting…" placeholder guard from `accessType === "distributor"` to also
cover `"partner"`.

---

## Phase 3 — Guarded impersonation (SECURITY CRITICAL)

### 3a. `app/lib/admin-utils.ts`

Keep the existing sync `getEffectiveIcode` as-is (it already ignores partner impersonation, so any
route not yet migrated returns `null` for a partner — fail-closed). Add:

```ts
export async function requirePartner() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.accessType !== "partner") {
    return {
      error: NextResponse.json({ error: "Partner access required" }, { status: 403 }),
      session: null,
    };
  }
  return { error: null, session };
}

export async function partnerCanAccessIcode(
  partnerId: string | number | undefined,
  icode: string,
): Promise<boolean> {
  const pid = typeof partnerId === "string" ? parseInt(partnerId, 10) : partnerId;
  if (!pid || Number.isNaN(pid)) return false;
  const row = await prisma.partner_clients.findUnique({
    where: { partner_id_icode: { partner_id: pid, icode } },
    select: { id: true },
  });
  return !!row;
}

/**
 * Async, impersonation-aware icode resolver that ALSO enforces the partner book.
 * Use this in every data endpoint reachable by a partner.
 *  - admin impersonating  -> impersonating.icode (trusted; admin may view anyone)
 *  - partner impersonating -> impersonating.icode ONLY if it is in their book, else null
 *  - regular client       -> session.user.icode
 */
export async function getEffectiveIcodeChecked(session: any): Promise<string | null> {
  if (!session?.user) return null;

  if (session.user.accessType === "admin" && session.user.impersonating?.icode) {
    return session.user.impersonating.icode;
  }

  if (session.user.accessType === "partner" && session.user.impersonating?.icode) {
    const ok = await partnerCanAccessIcode(
      session.user.partnerId,
      session.user.impersonating.icode,
    );
    return ok ? session.user.impersonating.icode : null;
  }

  return session.user.icode || null;
}
```

### 3b. `POST /api/partner/impersonate/route.ts` (new)
Mirror `app/api/admin/impersonate/route.ts`, but gate with `requirePartner()` and **verify the
target icode is in the book before returning** the client display info (read-only):

```ts
const { error, session } = await requirePartner();
if (error) return error;
const { icode } = await request.json();
if (!icode) return NextResponse.json({ error: "icode is required" }, { status: 400 });

const allowed = await partnerCanAccessIcode(session!.user.partnerId, icode);
if (!allowed) return NextResponse.json({ error: "Client not in your book" }, { status: 403 });

const client = await prisma.clients.findFirst({
  where: { icode }, select: { icode: true, user_name: true, email: true },
});
if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
return NextResponse.json({ icode: client.icode, name: client.user_name, email: client.email });
```

### 3c. Migrate every partner-reachable data endpoint to `getEffectiveIcodeChecked`
Replace `const icode = getEffectiveIcode(session);` with
`const icode = await getEffectiveIcodeChecked(session);` (all call sites are already `async`) in:

- `app/api/portfolio/route.ts:81`
- `app/api/pms-data/route.ts:11`
- `app/api/dashboard/stats/route.ts:12`
- `app/api/accounts/route.ts:11`
- `app/lib/bifurcated-auth.ts:28` and `:82` (used by bifurcated + holdings-summary paths)

Also audit and route through the checked resolver any endpoint the impersonated dashboard hits
that resolves icode **directly** from the session rather than via `getEffectiveIcode` — check:
- `app/api/sarla-api/route.ts` (Sarla/Satidham path)
- `app/personal-details` data source / `app/api` personal-details route
- holding-summary / quarterly-fees data routes

> Rule of thumb: grep for `impersonating` and `session.user.icode` under `app/api/**`; anything a
> partner session can reach must resolve icode via `getEffectiveIcodeChecked`.

---

## Phase 4 — Middleware (`middleware.ts`)

Add a `/partner` edge guard mirroring the existing `/internal` guard (currently the only
edge-guarded prefix):

```ts
if (pathname.startsWith("/partner") || pathname.startsWith("/api/partner")) {
  if (token?.accessType !== "partner") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}
```

(Place it next to the internal-route guard, before the client visibility-gate logic.)

---

## Phase 5 — Partner landing (this is what differs from the admin view)

### 5a. Routes
- `app/partner/layout.tsx` — wraps children; simple guarded shell (redirect non-partner to `/`).
- `app/partner/page.tsx` — the landing; renders (a) the aggregated **book view** and
  (b) the scoped **client list**.

### 5b. APIs (new, all `requirePartner()`-guarded, read-only)
- `GET /api/partner/clients` — returns **only** clients in the partner's book, with a
  **restricted field set** (TBD — see Open Questions). Source: `partner_clients` joined to
  `clients` for this `partnerId`; enrich each with account/AUM summary as needed.
- `GET /api/partner/book-summary` — aggregated roll-up across the book (metrics TBD — see Open
  Questions). Derive per-client qcodes via `getUserQcodes(icode)` then aggregate.

### 5c. UI
- Reuse the **shape** of `components/admin/ClientManagement.tsx` / `ClientCard.tsx` for the client
  list, but backed by `/api/partner/clients` and with restricted fields. "View Dashboard" calls
  the partner impersonate flow (Phase 6).
- New **aggregated book view** component (total AUM, blended return, client count, per-client rows
  — final metric list TBD).
- Do **not** reuse `components/admin/AdminHeader.tsx` copy ("Client Management Dashboard"); give
  the partner landing its own header.

---

## Phase 6 — Impersonated client view (minimal — "nothing changes inside")

Reuse `/dashboard` and all existing render paths unchanged. Only the enter/exit + banner differ:

- **Enter:** partner landing "View Dashboard" → `POST /api/partner/impersonate` →
  `updateSession({ impersonating: { icode, name, email } })` → poll `/api/auth/session` until it
  reflects the impersonation → `router.replace("/dashboard")`. (Mirror `app/admin/page.tsx`
  `handleImpersonate`.)
- **`app/dashboard/page.tsx`:** the `isImpersonating` / `effectiveIcode` computation currently keys
  off `isAdmin`. Extend it to also treat `accessType === "partner"` as an impersonator so the
  dashboard renders the impersonated client and shows the banner. The admin-not-impersonating
  redirect (lines ~459-463) should send a partner-not-impersonating back to `/partner`.
- **`components/admin/ImpersonationBanner.tsx`** and **`components/sidebar.tsx`:** the "Back to
  Admin" label + exit target (`/admin`) are hardcoded. Make them role-aware:
  admin → "Back to Admin" / `/admin`; partner → "Back to Partner" / `/partner`.
  In `sidebar.tsx`, `isImpersonating` currently requires `isAdmin`; broaden to
  `isAdmin || isPartner`, and change `handleExitImpersonation`'s `router.push("/admin")`
  accordingly.

---

## Phase 7 — Verify (no side effects until this point is reached)

1. Stop the Next dev server (frees the Prisma query-engine DLL lock on Windows), then
   `npx prisma generate` and `npm run build`.
2. Seed a test partner row + a couple of `partner_clients` rows (DB, team-side).
3. E2E:
   - Partner login → lands on `/partner`, sees only their book.
   - "View Dashboard" on an **in-book** client → dashboard renders, banner shows "Back to Partner".
   - Attempt to impersonate an **out-of-book** icode by forging `updateSession({ impersonating })`
     from the console → data endpoints must return 401/403 (server re-verification working).
   - Exit → back to `/partner`.
   - Legacy `distributor` login (`live@qodeinvest.com`) still lands on the old `/distributor`,
     fully unchanged.
4. Confirm no write ops were added (grep for `create/update/delete/upsert` in new code — should be
   none; everything is read-only).

---

## Files touched (summary)

| Phase | File | Change |
|------|------|--------|
| 1 | `prisma/schema.prisma` | add `partners`, `partner_clients`; back-relation on `clients` |
| 2 | `types/next-auth.d.ts` | add `partner` + `partnerId` + fix `impersonating` type |
| 2 | `app/api/auth/[...nextauth]/route.ts` | partner authorize branch; carry `partnerId`; widen impersonation gate |
| 2 | `app/page.tsx` | route `partner` → `/partner` |
| 3 | `app/lib/admin-utils.ts` | `requirePartner`, `partnerCanAccessIcode`, `getEffectiveIcodeChecked` |
| 3 | `app/api/partner/impersonate/route.ts` | new, book-checked impersonate endpoint |
| 3 | `app/api/{portfolio,pms-data,dashboard/stats,accounts}/route.ts`, `app/lib/bifurcated-auth.ts`, + audited sarla/personal-details/holdings routes | use `getEffectiveIcodeChecked` |
| 4 | `middleware.ts` | edge guard for `/partner` + `/api/partner` |
| 5 | `app/partner/{layout,page}.tsx`, `app/api/partner/{clients,book-summary}/route.ts`, new UI components | partner landing + scoped/aggregated APIs |
| 6 | `app/dashboard/page.tsx`, `components/admin/ImpersonationBanner.tsx`, `components/sidebar.tsx` | treat partner as impersonator; role-aware "Back to …" |

## Open questions (do NOT block Phases 1–4; needed for Phase 5)

1. **Restricted field set** — which fields to hide from partners on the client list / book view
   (fees? contact/PII? specific schemes?).
2. **Book-summary metrics** — exactly what the aggregated roll-up shows (total AUM, blended
   return/CAGR, per-client rows, current-month P&L, …).
3. **Fate of legacy `distributor`** — confirmed: leave untouched (kept for reference).
