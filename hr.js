// /api/hr — connect to an HR source and pull rosters.
// Authenticated: requires the caller's Supabase access token (Bearer).
// Connection metadata is stored per-user; secrets stay in Vercel env.
//
// Actions (POST body { action, ... }):
//   { action:'connect', kind:'workday', base_url, tenant, client_id }
//   { action:'connect', kind:'mcp', base_url }
//   { action:'roster',  connection_id, fields:[...] }
//
// Vercel env vars:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY      (verify the user + write rows)
//   WORKDAY_CLIENT_SECRET                          (the secret half of OAuth)
//   MCP_API_KEY

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // --- authenticate the caller ---
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
      // Validate the connection actually works before saving it.
      if (kind === 'workday') {
        await workdayToken(base_url, tenant, client_id); // throws if creds bad
      }
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

/* --------------- Workday OAuth + pull --------------- */
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

async function pullWorkday(conn, fields) {
  const token = await workdayToken(conn.base_url, conn.tenant, conn.client_id);
  const r = await fetch(
    `${conn.base_url}/ccx/api/staffing/v6/${conn.tenant}/workers?limit=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok) throw new Error('Workday workers fetch failed (' + r.status + ')');
  const data = await r.json();
  return (data.data || []).map((w) => {
    const m = { name: w.descriptor, emp_id: w.id };
    if (fields.includes('start')) m.start_week = w.hireDate;
    if (fields.includes('role'))  m.role = w.primaryJob?.descriptor;
    if (fields.includes('mgr'))   m.manager = w.manager?.descriptor;
    return m;
  });
}

/* --------------- generic MCP / HR --------------- */
async function pullMCP(conn, fields) {
  const r = await fetch(`${conn.base_url}/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.MCP_API_KEY || ''}` },
    body: JSON.stringify({ name: 'list_employees', arguments: { fields } }),
  });
  if (!r.ok) throw new Error('MCP call failed (' + r.status + ')');
  const data = await r.json();
  return (data?.result?.employees || []).map((e) => ({
    name: e.name, emp_id: e.employee_id, start_week: e.start_date, role: e.title, manager: e.manager,
  }));
}
