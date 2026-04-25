-- ──────────────────────────────────────────────────────────────────────────────
-- 0006_rls_policies.sql
-- Row Level Security per webapp.md §3.2.
-- Current state (auth.md §1): single principal (Director). One named policy per
-- table for authenticated users + service_role bypass for Inngest jobs.
-- Multi-user differentiation (EXEC-DIR-AI scoped privileges, human delegates) is
-- future work per auth.md §5; tighten policies in a follow-up migration when
-- additional principals are introduced.
-- ──────────────────────────────────────────────────────────────────────────────

-- Enable RLS on every public table.
ALTER TABLE public.episodes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_state        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_authority  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_prompts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config          ENABLE ROW LEVEL SECURITY;

-- ─── Authenticated (Director) — full access on all tables ────────────────────
-- service_role bypasses RLS automatically; no policy needed for Inngest jobs.

CREATE POLICY director_all ON public.episodes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.assets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.approvals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.budget_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.analytics_reports
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.series_state
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.approval_authority
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.agent_prompts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY director_all ON public.app_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── anon — no access ────────────────────────────────────────────────────────
-- No policies for the `anon` role → anonymous requests are rejected by RLS default.
-- The webapp's anon key gives the JS client a token only; all data access requires
-- an authenticated session (Supabase Auth → Director login).
