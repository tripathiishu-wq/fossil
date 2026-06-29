// /api/hr — connect to an HR source and pull rosters WITH hierarchy.
// Authenticated: requires the caller's Supabase access token (Bearer).
// Connection metadata stored per-user; secrets stay in Vercel env.
//
// Actions (POST body { action, ... }):
//   { action:'connect', kind:'workday', base_url, tenant, client_id }
//   { action:'connect', kind:'mcp', base_url }
//   { action:'roster',  connection_id, fields:[...] }   // returns members w/ manager + dept + cost center
//
// Vercel env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   WORKDAY_CLIENT_SECRET
//   MCP_API_KEY

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return res.status(401).json({ error: 'Invalid session' });
  const userId = u.user.id;

  const { action } = req.body || {};

  try {
    if (action === 'connect') {
      const { kind, base_url, tenant, client_id } = req.body;
      if (kind === 'workday') await workdayToken(base_url, tenant, client_id);
      const { data, error } = await admin.from('hr_connections').insert({
        owner_id: userId, kind, base_url, tenant, client_id, status: 'connected',
      }).select().single();
      if (error) throw error;
      return res.status(200).json({ connection: data });
    }

    if (action === 'roster') {
      const { connection_id, fields = ['name', 'id'] } = req.body;
      const { data: conn, error } = await admin
        .from('hr_connections').select('*')
        .eq('id', connection_id).eq('owner_id', userId).single();
      if (error || !conn) return res.status(404).json({ error: 'Connection not found' });

      const members = conn.kind === 'workday'
        ? await pullWorkday(conn, fields)
        : await pullMCP(conn, fields);
      return res.status(200).json({ members });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(502).json({ error: 'HR source error: ' + String(err.message || err) });
  }
}

/* --------------- Workday OAuth --------------- */
async function workdayToken(baseUrl, tenant, clientId) {
  const r = await fetch(`${baseUrl}/ccx/oauth2/${tenant}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: process.env.WORKDAY_CLIENT_SECRET || '',
    }),
  });
  if (!r.ok) throw new Error('Workday auth failed (' + r.status + ')');
  const j = await r.json();
  if (!j.access_token) throw new Error('No Workday token returned');
  return j.access_token;
}

/* --------------- Workday roster + hierarchy --------------- */
// Pulls workers, then resolves each worker's manager into a display name
// using the worker set itself, so the "By Manager" view fills automatically.
async function pullWorkday(conn, fields) {
  const token = await workdayToken(conn.base_url, conn.tenant, conn.client_id);

  // 1) pull workers (paginate up to a few hundred)
  let workers = [];
  let offset = 0;
  for (let page = 0; page < 5; page++) {
    const r = await fetch(
      `${conn.base_url}/ccx/api/staffing/v6/${conn.tenant}/workers?limit=100&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!r.ok) throw new Error('Workday workers fetch failed (' + r.status + ')');
    const data = await r.json();
    const batch = data.data || [];
    workers = workers.concat(batch);
    if (batch.length < 100) break;
    offset += 100;
  }

  // 2) build an id -> name map so we can resolve manager ids to manager names
  const nameById = {};
  workers.forEach((w) => { nameById[w.id] = w.descriptor; });

  // 3) map to our member shape with hierarchy + rich fields.
  // Workday field paths vary by tenant; these are the common v6 shapes.
  return workers.map((w) => {
    const mgrId = w.managementChain?.[0]?.id || w.manager?.id || null;
    const m = {
      name: w.descriptor,
      emp_id: w.workerId || w.id,
      wd_worker_id: w.id,
      manager_id: mgrId,
      manager: mgrId ? (nameById[mgrId] || w.manager?.descriptor || null) : (w.manager?.descriptor || null),
    };
    if (fields.includes('start')) m.start_week = w.hireDate;
    if (fields.includes('role'))  m.job_title = w.primaryJob?.descriptor || w.businessTitle;
    // always carry dept + cost center when present (cheap, useful for rollups)
    m.department  = w.primaryJob?.supervisoryOrganization?.descriptor || w.organization?.descriptor || null;
    m.cost_center = w.costCenter?.descriptor || w.primaryJob?.costCenter?.descriptor || null;
    return m;
  });
}

/* --------------- generic MCP / HR --------------- */
async function pullMCP(conn, fields) {
  const r = await fetch(`${conn.base_url}/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MCP_API_KEY || ''}` },
    body: JSON.stringify({ name: 'list_employees', arguments: { fields, include_hierarchy: true } }),
  });
  if (!r.ok) throw new Error('MCP call failed (' + r.status + ')');
  const data = await r.json();
  return (data?.result?.employees || []).map((e) => ({
    name: e.name, emp_id: e.employee_id, wd_worker_id: e.id,
    manager: e.manager, manager_id: e.manager_id,
    start_week: e.start_date, job_title: e.title,
    department: e.department, cost_center: e.cost_center,
  }));
}
