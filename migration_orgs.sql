-- ============================================================
-- RampIQ — ADD-ON migration: Organizations + platform admin
-- Run this AFTER the original schema. Safe & additive.
-- ============================================================

-- ORGANIZATIONS ---------------------------------------------
create table if not exists organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- MEMBERSHIP: which users belong to which org -----------------
create table if not exists org_members (
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'trainer',   -- 'admin' | 'trainer'
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Tag existing tables with org so data is shared within a company.
alter table teams        add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table members      add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table assessments  add column if not exists org_id uuid references organizations(id) on delete cascade;

create index if not exists idx_teams_org   on teams(org_id);
create index if not exists idx_members_org on members(org_id);
create index if not exists idx_assess_org  on assessments(org_id);
create index if not exists idx_orgmem_user on org_members(user_id);

-- RLS for the new tables -------------------------------------
alter table organizations enable row level security;
alter table org_members   enable row level security;

-- A user can see orgs they belong to.
create policy "see my orgs" on organizations for select
  using (exists (select 1 from org_members om where om.org_id = id and om.user_id = auth.uid()));
-- Any signed-in user can create an org (they become its admin via app logic).
create policy "create org" on organizations for insert with check (auth.uid() = created_by);

-- A user can see membership rows for orgs they belong to.
create policy "see my memberships" on org_members for select
  using (user_id = auth.uid() or exists (
    select 1 from org_members om2 where om2.org_id = org_id and om2.user_id = auth.uid()));
create policy "join org" on org_members for insert with check (user_id = auth.uid());

-- ============================================================
-- Replace per-USER isolation with per-ORG sharing on data tables.
-- A user sees rows for any org they belong to. (Falls back to
-- owner_id for legacy rows with no org_id.)
-- ============================================================
drop policy if exists "own teams"       on teams;
drop policy if exists "own members"     on members;
drop policy if exists "own assessments" on assessments;

create policy "org teams" on teams for all using (
  owner_id = auth.uid() OR
  (org_id is not null and exists (select 1 from org_members om where om.org_id = teams.org_id and om.user_id = auth.uid()))
) with check (
  owner_id = auth.uid() OR
  (org_id is not null and exists (select 1 from org_members om where om.org_id = teams.org_id and om.user_id = auth.uid()))
);

create policy "org members" on members for all using (
  owner_id = auth.uid() OR
  (org_id is not null and exists (select 1 from org_members om where om.org_id = members.org_id and om.user_id = auth.uid()))
) with check (
  owner_id = auth.uid() OR
  (org_id is not null and exists (select 1 from org_members om where om.org_id = members.org_id and om.user_id = auth.uid()))
);

create policy "org assessments" on assessments for all using (
  owner_id = auth.uid() OR
  (org_id is not null and exists (select 1 from org_members om where om.org_id = assessments.org_id and om.user_id = auth.uid()))
) with check (
  owner_id = auth.uid() OR
  (org_id is not null and exists (select 1 from org_members om where om.org_id = assessments.org_id and om.user_id = auth.uid()))
);

-- ============================================================
-- PLATFORM ADMIN (you) — aggregate view across ALL orgs.
-- Change the email below to your real platform-owner address.
-- ============================================================
create or replace view platform_stats
with (security_invoker = on) as
select
  o.id as org_id,
  o.name as org_name,
  o.created_at,
  (select count(*) from org_members om where om.org_id = o.id) as trainers,
  (select count(distinct t.id) from teams t where t.org_id = o.id) as teams,
  (select count(*) from assessments a where a.org_id = o.id) as assessments,
  (select round(avg((a.result->>'composite')::numeric),1)
     from assessments a where a.org_id = o.id) as avg_score
from organizations o;

-- Additional SELECT policy: the platform owner can read ALL orgs
-- (this is what makes platform_stats return every company's row).
create policy "platform owner all orgs" on organizations for select
  using ( auth.jwt()->>'email' = 'tripathi.ishu@gmail.com' );
