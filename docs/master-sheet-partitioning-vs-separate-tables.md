# Partitioning vs Separate Tables Per Client

## How They Work

**Partitioning** — One logical `master_sheet` table, but PostgreSQL internally splits data into per-client physical chunks. Application code doesn't change at all — it still queries `master_sheet` and Postgres figures out which chunk to look at.

**Separate Tables** — Literally create `master_sheet_qac00041`, `master_sheet_qac00046`, etc. Application code must pick the right table name before querying.

---

## Comparison

| Concern | Partitioning | Separate Tables |
|---|---|---|
| **Application code changes** | None. Prisma queries stay exactly the same. | Every query needs dynamic table routing. Prisma doesn't natively support this — you'd need raw SQL or a custom abstraction layer. |
| **Schema changes** | Run one `ALTER TABLE` on the parent — all partitions update automatically. | Must alter every single table individually. Miss one and you have schema drift. |
| **Adding a new client** | One DDL command: `CREATE TABLE ... PARTITION OF ...` | Create a new table, then update the routing logic in code and redeploy. |
| **Removing a client** | `DROP` the partition. Clean, instant. | `DROP` the table + update routing logic + redeploy. |
| **Query performance** | Postgres automatically skips irrelevant partitions (partition pruning). Same speed as querying a small table. | Same speed — you're hitting a small table directly. |
| **Cross-client queries** | Just query the parent table as normal — Postgres merges results. | Need `UNION ALL` across N tables. Painful and error-prone as client count grows. |
| **Prisma compatibility** | Fully transparent — Prisma sees one table, reads/writes work unchanged. | Poor. Prisma generates code per model. You'd need a model per table or abandon Prisma for raw SQL. |
| **Backups / archiving** | Can backup or archive individual partitions. | Can backup individual tables. Same. |
| **Operational overhead** | Low — automate partition creation in onboarding script. | High — every new client means code changes, table creation, and a deployment. |
| **Risk of bugs** | Low — routing is handled by Postgres, not your code. | High — a wrong table name silently returns empty data. No compile-time safety. |

---

## Bottom Line

**Separate tables** give you physical isolation but push all the routing complexity into application code. With ~50+ queries across the codebase and Prisma as the ORM, this would be a significant rewrite with ongoing maintenance cost every time a client is added or removed.

**Partitioning** gives you the same physical isolation and performance benefits, but Postgres handles the routing. App code doesn't change. New client = one SQL command, no redeploy.

**Recommendation: Partitioning.** All the benefits of separate tables with none of the application-level complexity.
