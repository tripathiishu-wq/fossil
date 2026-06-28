-- ============================================================
-- RampIQ schema — run in Supabase SQL editor
-- Per-trainer data isolation via Row Level Security (RLS).
-- Each trainer/manager only ever sees their own teams + assessments.
-- ============================================================

-- TEAMS ------------------------------------------------------
create table if not exists teams (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  source      text not null default 'manual',   -- 'workday' | 'mcp' | 'manual'
  fields      jsonb not null default '["name","id"]',
  created_at  timestamptz not null default now()
);

-- MEMBERS (roster rows) -------------------------------------
create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emp_id      text,
  start_week  text,
  role        text,
  manager     text,
  created_at  timestamptz not null default now()
);

-- ASSESSMENTS ------------------------------------------------
create table if not exists assessments (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  team_id     uuid references teams(id) on delete set null,
  member_id   uuid references members(id) on delete set null,
  name        text not null,
  cohort      text,
  milestones  jsonb not null,
  quality     jsonb not null,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);

-- WORKDAY CONNECTIONS (per trainer) -------------------------
-- Stores only non-secret connection metadata + a reference.
-- Actual client secret stays in Vercel env, NOT here.
create table if not exists hr_connections (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  kind        text not null,                     -- 'workday' | 'mcp'
  base_url    text,
  tenant      text,
  client_id   text,
  status      text not null default 'connected',
  created_at  timestamptz not null default now()
);

-- INDEXES ----------------------------------------------------
create index if not exists idx_teams_owner       on teams(owner_id);
create index if not exists idx_members_team       on members(team_id);
create index if not exists idx_members_owner      on members(owner_id);
create index if not exists idx_assess_owner       on assessments(owner_id);
create index if not exists idx_conn_owner         on hr_connections(owner_id);

-- ============================================================
-- ROW LEVEL SECURITY — the core of per-trainer separation
-- ============================================================
alter table teams           enable row level security;
alter table members         enable row level security;
alter table assessments     enable row level security;
alter table hr_connections  enable row level security;

-- Each policy restricts every operation to rows the user owns.
create policy "own teams"        on teams          for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own members"      on members        for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own assessments"  on assessments    for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own connections"  on hr_connections for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ============================================================
-- OPTIONAL: org-level sharing (uncomment later if managers
-- should see their reports' data). For now: strict isolation.
-- ============================================================
