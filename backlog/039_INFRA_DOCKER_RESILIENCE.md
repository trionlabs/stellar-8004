# 039 — Docker Deploy Resilience

**Status:** DONE
**Owner:** claude/yaman
**Date:** 2026-04-06

## Context

Dokploy wipes `code/` on every deploy (fresh git clone). All bind-mounted stateful data inside `code/` was being destroyed — DB data, storage files, studio snippets. Additionally, SELinux `:z`/`:Z` flags on a non-SELinux VPS caused intermittent empty volume mounts. Migrations had no tracking, so re-runs on existing DBs failed.

## Root Causes

1. DB data bind mount (`./volumes/db/data`) inside `code/` → wiped on redeploy
2. Storage + snippets bind mounts inside `code/` → same issue
3. `:z`/`:Z` SELinux flags on non-SELinux system → empty mounts after restart
4. No migration tracking → `CREATE TABLE` fails on re-run
5. DB healthcheck only `pg_isready` → doesn't catch data corruption
6. `generate-keys.sh` missing `REALTIME_DB_ENC_KEY` generation
7. Realtime missing `cap_add: [SETUID, SETGID]`

## Changes

| File | Change |
|------|--------|
| `docker-compose.supabase.yml` | DB data → named volume `s8004-db-data` (external) |
| `docker-compose.supabase.yml` | Storage → named volume `s8004-storage-data` |
| `docker-compose.supabase.yml` | Snippets → named volume `s8004-snippets` |
| `docker-compose.supabase.yml` | All `:z`/`:Z` flags removed, config mounts → `:ro` |
| `docker-compose.supabase.yml` | `schema_migrations` tracking table in migrate service |
| `docker-compose.supabase.yml` | Each migration wrapped in `BEGIN/COMMIT` transaction |
| `docker-compose.supabase.yml` | DB healthcheck: `pg_isready && psql -c 'SELECT 1'` |
| `docker-compose.supabase.yml` | Realtime: `cap_add: [SETUID, SETGID]` |
| `generate-keys.sh` | Added `REALTIME_DB_ENC_KEY` generation (`gen_hex 8` = 16 chars) |
| `.env.example` | Documented 16-char requirement for enc key |

## Commits

- `a737967` fix(docker): prevent DB data loss on Dokploy redeploy, fix realtime crash
- `098ff2b` fix(docker): remove SELinux :z/:Z flags
- `3bb6975` fix(docker): comprehensive volume and deploy resilience overhaul

## Verification

- [x] Migrate container exits 0 on fresh DB
- [x] Migrate container exits 0 on re-run (all skipped)
- [x] All 14 containers healthy
- [x] Named volumes survive container recreate
