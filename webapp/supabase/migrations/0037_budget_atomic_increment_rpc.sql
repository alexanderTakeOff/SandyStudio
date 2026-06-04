-- ──────────────────────────────────────────────────────────────────────────────
-- 0037_budget_atomic_increment_rpc.sql
-- Money-safety UNIT 3 (I7): atomic, ceiling-guarded increment of
-- episodes.budget_spent.
--
-- Problem this fixes:
--   The old TS path (lib/budget.ts recordCost) did read-modify-write:
--     SELECT budget_spent, budget_ceiling ... ; (check in JS) ; UPDATE ... .
--   Two concurrent EXEC-VGEN shots (fan-out runs 3/episode) could both read
--   the same budget_spent, both pass the ceiling check, then both UPDATE —
--   overspending past the ceiling and/or losing one increment (lost-update
--   race). The check and the write were not atomic.
--
-- This function performs the check AND the increment in a single UPDATE so the
-- row lock serialises concurrent callers. The ceiling predicate lives in the
-- UPDATE's WHERE clause: if adding p_cost would exceed budget_ceiling, no row
-- is updated and we report allowed=false WITHOUT mutating budget_spent.
--
-- Semantics:
--   - budget_ceiling IS NULL  → no ceiling; always allowed; always increments.
--   - budget_spent + p_cost <= budget_ceiling → allowed; increments.
--   - otherwise → NOT allowed; budget_spent unchanged; returns current values.
--   - p_cost = 0 → always allowed; no-op increment (audit-only spends).
--   - episode not found → returns zero row (allowed=false) so callers fail loud.
--
-- Idempotent: CREATE OR REPLACE. Safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

create or replace function public.increment_budget_spent(
  p_episode uuid,
  p_cost numeric
)
returns table (
  spent numeric,
  ceiling numeric,
  allowed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated record;
  v_current record;
begin
  -- Atomic guarded increment. The WHERE predicate enforces the ceiling in the
  -- same statement that mutates the row, so the row lock serialises concurrent
  -- callers and no lost-update / overspend race is possible.
  update public.episodes e
     set budget_spent = coalesce(e.budget_spent, 0) + p_cost
   where e.id = p_episode
     and (
       e.budget_ceiling is null
       or coalesce(e.budget_spent, 0) + p_cost <= e.budget_ceiling
     )
  returning e.budget_spent, e.budget_ceiling
       into v_updated;

  if found then
    spent := v_updated.budget_spent;
    ceiling := v_updated.budget_ceiling;
    allowed := true;
    return next;
    return;
  end if;

  -- Not updated: either the episode does not exist, or the increment would
  -- exceed the ceiling. Report current state with allowed=false so the caller
  -- can throw a typed BudgetExceededError BEFORE spending.
  select coalesce(e.budget_spent, 0) as budget_spent, e.budget_ceiling as budget_ceiling
    into v_current
    from public.episodes e
   where e.id = p_episode;

  if found then
    spent := v_current.budget_spent;
    ceiling := v_current.budget_ceiling;
  else
    spent := 0;
    ceiling := null;
  end if;
  allowed := false;
  return next;
  return;
end;
$$;

-- Service-role is the only caller (Inngest functions + server API routes use the
-- service-role client). Grant execute explicitly.
grant execute on function public.increment_budget_spent(uuid, numeric) to service_role;

comment on function public.increment_budget_spent(uuid, numeric) is
  'Atomic ceiling-guarded increment of episodes.budget_spent. Returns (spent, ceiling, allowed). allowed=false means the increment would exceed budget_ceiling (or the episode was not found) and budget_spent was left unchanged. UNIT 3 / migration 0037.';
