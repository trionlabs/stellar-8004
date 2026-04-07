# 041 - Dokploy Env Management

**Status:** DONE
**Owner:** claude/yaman
**Date:** 2026-04-06

## Context

`REALTIME_DB_ENC_KEY` kept reverting to 32 chars after every deploy, crashing Realtime (AES-128-ECB needs exactly 16 chars). Manual VPS fixes were overwritten.

## Root Cause

Dokploy stores env vars in its own Postgres DB (`compose.env` column). On every deploy it writes this stored env to `code/docker/.env`. Manual edits to `.env` on VPS are ephemeral.

## Fix

1. Updated Dokploy DB directly: `UPDATE compose SET env = replace(env, '...32char...', '...16char...')`
2. User confirmed via Dokploy UI
3. Documented 16-char requirement in `.env.example`
4. `generate-keys.sh` now generates correct 16-char key

## Lesson

All env changes for Dokploy-managed compose services MUST go through Dokploy UI or Dokploy DB - never edit `.env` on VPS directly.

## Commits

- `4ef97fc` docs(docker): document REALTIME_DB_ENC_KEY 16-char requirement

## Verification

- [x] Dokploy DB has correct 16-char key
- [x] VPS .env matches
- [x] Realtime healthy after deploy
