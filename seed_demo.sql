-- ============================================================
-- RampIQ — DEMO SEED + BACKFILL
-- Run in Supabase SQL Editor. Makes the dashboard/platform look alive.
--
-- 1) BACKFILL: tag your existing teams/members/assessments into your org
--    (so old data stops being invisible to the org rollups).
-- 2) SEED: add a realistic demo team with assessed trainees.
--
-- Set @owner_email below to the account you'll demo from.
-- ============================================================

do $$
declare
  owner_email text := 'tripathi.ishu@gmail.com';   -- << change to your demo login
  uid uuid;
  oid uuid;
  team1 uuid;
begin
  select id into uid from auth.users where email = owner_email;
  if uid is null then raise notice 'No user for %', owner_email; return; end if;

  -- ensure an org exists for this user
  select om.org_id into oid from org_members om where om.user_id = uid limit 1;
  if oid is null then
    insert into organizations(name, created_by) values ('FSSPL', uid) returning id into oid;
    insert into org_members(org_id, user_id, role) values (oid, uid, 'admin');
  end if;

  -- 1) BACKFILL existing rows with org_id where missing
  update teams       set org_id = oid where owner_id = uid and org_id is null;
  update members     set org_id = oid where owner_id = uid and org_id is null;
  update assessments set org_id = oid where owner_id = uid and org_id is null;

  -- 2) SEED a demo team + trainees + assessments
  insert into teams(owner_id, org_id, name, source, fields)
    values (uid, oid, 'APAC SDR — Spring Cohort', 'manual', '["name","id"]')
    returning id into team1;

  insert into members(owner_id, org_id, team_id, name, emp_id, start_week, role) values
    (uid, oid, team1, 'Aarav Shah',   'EMP-2300', 'W8 2026',  'SDR'),
    (uid, oid, team1, 'Priya Menon',  'EMP-2307', 'W8 2026',  'SDR'),
    (uid, oid, team1, 'Diego Torres', 'EMP-2314', 'W9 2026',  'SDR'),
    (uid, oid, team1, 'Sara Khan',    'EMP-2321', 'W9 2026',  'SDR'),
    (uid, oid, team1, 'Liam Chen',    'EMP-2328', 'W10 2026', 'SDR'),
    (uid, oid, team1, 'Maya Iyer',    'EMP-2335', 'W10 2026', 'SDR');

  -- assessments with varied results (composite + bands precomputed)
  insert into assessments(owner_id, org_id, team_id, name, cohort, milestones, quality, result) values
    (uid, oid, team1, 'Aarav Shah',  'W8 2026',
      '{"onboard":2,"shadow":3,"firstpitch":4,"firstdeal":8,"quota":14}',
      '{"winrate":4,"coach":4,"cert":4,"consist":4}',
      '{"composite":86,"velocity":88,"quality":100,"reached":5,"avgDelta":1.4,"band":"Proficient","col":"var(--green)"}'),
    (uid, oid, team1, 'Priya Menon', 'W8 2026',
      '{"onboard":2,"shadow":3,"firstpitch":5,"firstdeal":9,"quota":16}',
      '{"winrate":3,"coach":3,"cert":3,"consist":3}',
      '{"composite":72,"velocity":74,"quality":75,"reached":5,"avgDelta":0.2,"band":"Developing","col":"var(--amber)"}'),
    (uid, oid, team1, 'Diego Torres','W9 2026',
      '{"onboard":3,"shadow":5,"firstpitch":7,"firstdeal":12,"quota":0}',
      '{"winrate":2,"coach":2,"cert":3,"consist":2}',
      '{"composite":48,"velocity":46,"quality":56,"reached":4,"avgDelta":-1.8,"band":"Lagging","col":"var(--red)"}'),
    (uid, oid, team1, 'Sara Khan',   'W9 2026',
      '{"onboard":2,"shadow":3,"firstpitch":5,"firstdeal":8,"quota":15}',
      '{"winrate":4,"coach":3,"cert":4,"consist":4}',
      '{"composite":81,"velocity":82,"quality":94,"reached":5,"avgDelta":0.6,"band":"Proficient","col":"var(--green)"}'),
    (uid, oid, team1, 'Liam Chen',   'W10 2026',
      '{"onboard":3,"shadow":4,"firstpitch":6,"firstdeal":10,"quota":0}',
      '{"winrate":3,"coach":3,"cert":2,"consist":3}',
      '{"composite":58,"velocity":55,"quality":69,"reached":4,"avgDelta":-0.8,"band":"Developing","col":"var(--amber)"}'),
    (uid, oid, team1, 'Maya Iyer',   'W10 2026',
      '{"onboard":2,"shadow":3,"firstpitch":4,"firstdeal":7,"quota":13}',
      '{"winrate":4,"coach":4,"cert":4,"consist":3}',
      '{"composite":89,"velocity":91,"quality":94,"reached":5,"avgDelta":2.0,"band":"Proficient","col":"var(--green)"}');

  raise notice 'Seed + backfill complete for % (org %)', owner_email, oid;
end $$;
