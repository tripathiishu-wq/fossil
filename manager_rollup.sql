-- ============================================================
-- RampIQ — MANAGER ROLL-UP (notes + optional role tooling)
-- ============================================================
-- IMPORTANT: org-level roll-up ALREADY WORKS.
-- The org RLS policies (org teams / org members / org assessments)
-- let EVERY member of an org see ALL teams, members, and assessments
-- in that org. So a manager added to the org already sees their
-- trainers' scores on the Dashboard and Reports. No extra work needed
-- for the basic "manager sees their team" requirement.
--
-- The pieces below are OPTIONAL, for when you want finer hierarchy
-- (e.g. a manager sees only THEIR direct reports, not the whole org).
-- ============================================================

-- Roles already exist on org_members.role ('admin' | 'trainer').
-- Add 'manager' as a recognised role (no schema change needed; it's text).

-- To make someone a manager:
--   update org_members set role='manager' where user_id = '<uuid>' and org_id='<uuid>';

-- OPTIONAL: direct-report mapping for strict hierarchy ----------
create table if not exists reporting_lines (
  manager_id  uuid not null references auth.users(id) on delete cascade,
  report_id   uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  primary key (manager_id, report_id)
);
alter table reporting_lines enable row level security;
drop policy if exists "see my reporting lines" on reporting_lines;
create policy "see my reporting lines" on reporting_lines for select
  using (manager_id = auth.uid() or report_id = auth.uid());

-- NOTE: enforcing "manager sees only direct reports' assessments"
-- would require replacing the broad "org assessments" policy with one
-- that checks reporting_lines. Keep the broad org policy for now (simpler,
-- and matches the common "everyone in the org shares" model). Switch to
-- hierarchy enforcement only if a customer demands it.
