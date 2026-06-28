// /api/roster — pulls a team roster from an HR source.
//
// This is a DEPLOY-READY STUB. It returns realistic mock data so the app works
// immediately. Wire real sources where marked. The frontend calls this; if it
// fails or returns nothing, the frontend falls back to local mock data.
//
// Env vars to set in Vercel (Project → Settings → Environment Variables):
//   WORKDAY_BASE_URL, WORKDAY_TENANT, WORKDAY_CLIENT_ID, WORKDAY_CLIENT_SECRET
//   MCP_SERVER_URL, MCP_API_KEY   (for the generic MCP/HR path)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { source = 'workday', fields = ['name', 'id'] } = req.body || {};

  try {
    let members;
    if (source === 'workday') {
      members = await pullFromWorkday(fields);
    } else if (source === 'mcp') {
      members = await pullFromMCP(fields);
    } else {
      members = [];
    }
    return res.status(200).json({ source, members });
  } catch (err) {
    // surface the error but let the frontend fall back gracefully
    return res.status(200).json({ source, members: mockRoster(), warning: String(err) });
  }
}

/* ----------------- WORKDAY ----------------- */
async function pullFromWorkday(fields) {
  const { WORKDAY_BASE_URL, WORKDAY_TENANT, WORKDAY_CLIENT_ID, WORKDAY_CLIENT_SECRET } = process.env;
  if (!WORKDAY_BASE_URL || !WORKDAY_CLIENT_ID) {
    // not configured yet → mock so the product is demoable
    return mockRoster();
  }
  // 1) OAuth client-credentials token
  const tokenRes = await fetch(`${WORKDAY_BASE_URL}/ccx/oauth2/${WORKDAY_TENANT}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: WORKDAY_CLIENT_ID,
      client_secret: WORKDAY_CLIENT_SECRET,
    }),
  });
  const { access_token } = await tokenRes.json();

  // 2) Pull workers via the Staffing/Workers REST API (adjust path to your tenant)
  const wRes = await fetch(
    `${WORKDAY_BASE_URL}/ccx/api/staffing/v6/${WORKDAY_TENANT}/workers?limit=100`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const data = await wRes.json();

  // 3) Map Workday worker objects → our roster shape, honoring selected fields
  return (data.data || []).map((w) => {
    const m = { id: rid(), name: w.descriptor, empId: w.id };
    if (fields.includes('start')) m.start = w.hireDate;
    if (fields.includes('role'))  m.role  = w.primaryJob?.descriptor;
    if (fields.includes('mgr'))   m.mgr   = w.manager?.descriptor;
    return m;
  });
}

/* ----------------- GENERIC MCP / HR ----------------- */
async function pullFromMCP(fields) {
  const { MCP_SERVER_URL, MCP_API_KEY } = process.env;
  if (!MCP_SERVER_URL) return mockRoster();

  // Call an MCP server tool (e.g. "list_employees"). Shape depends on your server.
  const res = await fetch(`${MCP_SERVER_URL}/tools/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MCP_API_KEY}` },
    body: JSON.stringify({ name: 'list_employees', arguments: { fields } }),
  });
  const data = await res.json();
  const rows = data?.result?.employees || [];
  return rows.map((e) => ({
    id: rid(), name: e.name, empId: e.employee_id,
    start: e.start_date, role: e.title, mgr: e.manager,
  }));
}

/* ----------------- MOCK ----------------- */
function mockRoster() {
  const names = ['Aarav Shah','Priya Menon','Diego Torres','Sara Khan','Liam Chen','Maya Iyer','Noah Park','Zoe Alvarez'];
  return names.map((n, i) => ({
    id: rid(), name: n, empId: 'EMP-' + (2300 + i * 7),
    start: 'W' + (8 + i) + ' 2026', role: 'SDR', mgr: 'R. Banerjee',
  }));
}
const rid = () => Math.random().toString(36).slice(2, 9);
