# 040 — Postgres 15 → 17 Upgrade

**Status:** DONE
**Owner:** claude/yaman
**Date:** 2026-04-06

## Context

Local dev (`supabase start`) ran PG17, VPS ran PG15. Version drift risks incompatible SQL or behavior differences. PG17 drops `pgjwt` extension (deprecated). PG15 EOL approaching on Supabase platform (~May 2026).

## Upgrade Path

pg_dump/restore (not pg_upgrade — Supabase custom image incompatible).

1. DROP pgjwt (unused, deprecated in PG17)
2. pg_dump public + private schemas from PG15
3. Recreate DB volume, start PG17 container
4. Run migrate service (all 24 migrations fresh)
5. pg_restore --data-only from dump
6. Verify all services

## Changes

| File | Change |
|------|--------|
| `docker-compose.supabase.yml` | Image `supabase/postgres:15.8.1.085` → `17.4.1.029` |
| `024_api_rate_limits.sql` | Added missing `CREATE SCHEMA IF NOT EXISTS private` |

## PG17 Gains

- JSON_TABLE() — JSONB to relational rows in FROM clause
- Incremental backup (pg_basebackup block-level)
- Better vacuum, query parallelism, I/O
- pg_stat_statements 1.10 → 1.11

## PG17 Losses

- `pgjwt` — deprecated, was unused in our codebase
- `plv8`, `plcoffee`, `timescaledb` — not relevant (never used)

## Commits

- `d12f03f` feat(docker): upgrade Postgres 15 → 17, fix migration 024

## Verification

- [x] `SHOW server_version` = 17.4
- [x] All 8 extensions loaded (pgjwt removed)
- [x] Data restored: agents, feedback, validations intact
- [x] Indexer cron running (200 responses)
- [x] All 14 containers healthy
- [x] Local and VPS both on PG17
