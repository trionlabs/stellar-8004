# ISSUE-001: FOR UPDATE + Aggregate Function — Silent Concurrency Bug

**Severity:** HIGH
**Status:** OPEN — needs fix
**Affected:** `insert_feedback_response()` function
**Migrations:** 013, 017, 019
**Component:** `supabase/functions/resolve-uris/`, indexer event processing

---

## Summary

The `insert_feedback_response()` PL/pgSQL function has a concurrency gap in `response_index` derivation. Three migrations attempted to fix this with `FOR UPDATE`, but **PostgreSQL forbids `FOR UPDATE` with aggregate functions (`MAX`)**. The function has been silently broken since migration 013.

## Proof

```sql
SELECT COALESCE(MAX(response_index), 0) + 1
FROM public.feedback_responses
WHERE agent_id = 1
  AND client_address = 'test'
  AND feedback_index = 0
FOR UPDATE;

-- ERROR: FOR UPDATE is not allowed with aggregate functions
```

PostgreSQL docs: "FOR UPDATE/SHARE cannot be used with aggregate functions because it is not meaningful to lock rows that contribute to an aggregate."

## Timeline

| Migration | What happened | Outcome |
|-----------|--------------|---------|
| 013 (`013_atomic_response_index.sql`) | Added `FOR UPDATE` to prevent concurrent indexer race | **Silent failure** — function was CREATE'd but never tested with concurrent calls at migration time |
| 016 (`016_schema_validation_hardening.sql`) | Recreated function without `FOR UPDATE` | Accidentally "fixed" the syntax error by removing `FOR UPDATE` |
| 017 (`017_performance_and_integrity_fixes.sql`) | "Restored" `FOR UPDATE` because 016 "dropped" it | **Re-introduced the same silent bug** |
| 019 (`019_discovery_columns.sql`) | Recreated function — linter removed `FOR UPDATE` with explanatory comment | Correct removal, but root concurrency problem remains |

## The Actual Concurrency Problem

The race condition is real — it's just that `FOR UPDATE` was never a valid solution:

```
Time    Indexer-A                          Indexer-B
────    ─────────                          ─────────
T1      SELECT MAX(response_index) → 2
T2                                         SELECT MAX(response_index) → 2
T3      v_next_index = 3
T4                                         v_next_index = 3  (SAME!)
T5      INSERT (response_index=3) → OK
T6                                         INSERT (response_index=3) → DO NOTHING
                                           ^^^ DATA LOSS: response silently dropped
```

`ON CONFLICT DO NOTHING` prevents a constraint violation but **silently discards the second insert**. The caller gets `v_next_index = 3` back in both cases, with no indication that one insert was dropped.

## Current Safety Analysis

In practice, this race is **extremely unlikely** in the current system because:

1. The indexer processes ledgers sequentially (one at a time)
2. `ResponseAppended` events for the same `(agent_id, client_address, feedback_index)` tuple in the same ledger are rare
3. The `resolve-uris` edge function doesn't call `insert_feedback_response`
4. There's a concurrency guard (`pg_advisory_xact_lock`) in the indexer that prevents parallel runs

However, if any of these assumptions change (parallel indexing, multi-instance deployment), this becomes a real data loss vector.

## Proposed Solutions

### Option A: Advisory Lock (Recommended — minimal change)

Use a PostgreSQL advisory lock scoped to the `(agent_id, feedback_index)` tuple to serialize access:

```sql
CREATE OR REPLACE FUNCTION public.insert_feedback_response(
  p_agent_id integer,
  p_client_address text,
  p_feedback_index bigint,
  p_responder text,
  p_response_uri text,
  p_response_hash text,
  p_created_at timestamptz,
  p_tx_hash text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET statement_timeout = '10s'
AS $$
DECLARE
  v_next_index integer;
BEGIN
  -- Serialize concurrent calls for the same (agent_id, feedback_index) tuple.
  -- hashtext() converts the composite key to an int for pg_advisory_xact_lock.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_agent_id::text || ':' || p_feedback_index::text)
  );

  SELECT COALESCE(MAX(response_index), 0) + 1
  INTO v_next_index
  FROM public.feedback_responses
  WHERE agent_id = p_agent_id
    AND client_address = p_client_address
    AND feedback_index = p_feedback_index;

  INSERT INTO public.feedback_responses (
    agent_id, client_address, feedback_index, response_index,
    responder, response_uri, response_hash, created_at, tx_hash
  ) VALUES (
    p_agent_id, p_client_address, p_feedback_index, v_next_index,
    p_responder, p_response_uri, p_response_hash, p_created_at, p_tx_hash
  )
  ON CONFLICT (agent_id, client_address, feedback_index, response_index) DO NOTHING;

  RETURN v_next_index;
END;
$$;
```

**Pros:** Simple, no schema changes, transaction-scoped (auto-released on commit/rollback).
**Cons:** Advisory locks are process-wide (not database-wide across connections). Hash collisions theoretically possible but negligible.

### Option B: Subquery without aggregate (FOR UPDATE compatible)

Rewrite the SELECT to avoid aggregates so `FOR UPDATE` works:

```sql
SELECT response_index + 1
INTO v_next_index
FROM public.feedback_responses
WHERE agent_id = p_agent_id
  AND client_address = p_client_address
  AND feedback_index = p_feedback_index
ORDER BY response_index DESC
LIMIT 1
FOR UPDATE;

-- Handle no rows case
IF v_next_index IS NULL THEN
  v_next_index := 1;
END IF;
```

**Pros:** Standard row-level locking, no advisory lock overhead.
**Cons:** `FOR UPDATE` + `ORDER BY` + `LIMIT` is valid in PostgreSQL but locks the single row selected. If no rows exist yet (first response), there's nothing to lock — the race window remains for the very first insert.

### Option C: INSERT ... ON CONFLICT DO UPDATE with retry

Remove the SELECT entirely, use a sequence or retry loop:

```sql
-- Use a loop: try INSERT, if conflict bump index and retry
LOOP
  SELECT COALESCE(MAX(response_index), 0) + 1
  INTO v_next_index
  FROM public.feedback_responses
  WHERE agent_id = p_agent_id
    AND client_address = p_client_address
    AND feedback_index = p_feedback_index;

  INSERT INTO public.feedback_responses (...)
  VALUES (..., v_next_index, ...)
  ON CONFLICT (agent_id, client_address, feedback_index, response_index)
  DO NOTHING;

  IF FOUND THEN
    EXIT;  -- insert succeeded
  END IF;
  -- conflict: loop retries with updated MAX
END LOOP;
```

**Pros:** Guaranteed no data loss, no external locks.
**Cons:** More complex, slight performance overhead on conflicts.

## Recommendation

**Option A (advisory lock)** is the cleanest fix. The indexer already uses `pg_advisory_xact_lock` for ledger-level serialization (migration 013 Task 2), so this pattern is established in the codebase. It directly prevents the race without changing query structure.

**Option C (retry loop)** is the most robust if we want zero reliance on advisory locks.

## Impact Assessment

- **Current risk: LOW** — single indexer instance + advisory lock at ledger level already serializes processing
- **Future risk: HIGH** — if parallel indexing or multi-instance deployment is introduced without fixing this
- **Data loss potential:** Silent — `ON CONFLICT DO NOTHING` means no error, no log, just a missing response record

## Action Items

- [ ] Choose solution (A, B, or C)
- [ ] Write migration `021_fix_response_index_concurrency.sql`
- [ ] Add regression test: concurrent `insert_feedback_response` calls with same tuple
- [ ] Update migration 019 comment to reference this issue
- [ ] Consider adding a NOTICE/WARNING log when `ON CONFLICT DO NOTHING` fires (helps detect silent drops)
