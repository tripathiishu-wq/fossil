// /api/admin — platform-owner-only destructive actions.
// Authenticated via the caller's Supabase token; the caller's email must
// match PLATFORM_OWNER. Uses the service-role key for admin operations.
//
// Actions (POST body { action, ... }):
//   { action:'delete_org',  org_id }    → deletes org + its teams/members/assessments/memberships
//   { action:'delete_user', user_id }   → deletes a user's auth account (and cascades their data)
//
// Vercel env vars required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from '@supabase/supabase-js';

const PLATFORM_OWNER = 'tripathi.ishu@gmail.com'; // keep in sync with index.html

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // verify caller + that they are the platform owner
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return res.status(401).json({ error: 'Invalid session' });
  if (u.user.email !== PLATFORM_OWNER) {
    return res.status(403).json({ error: 'Platform owner only' });
  }

  const { action } = req.body || {};

  try {
    if (action === 'delete_org') {
      const { org_id } = req.body;
      if (!org_id) return res.status(400).json({ error: 'org_id required' });
      // delete dependent data first (service role bypasses RLS)
      await admin.from('assessments').delete().eq('org_id', org_id);
      await admin.from('members').delete().eq('org_id', org_id);
      await admin.from('teams').delete().eq('org_id', org_id);
      await admin.from('org_members').delete().eq('org_id', org_id);
      const { error } = await admin.from('organizations').delete().eq('id', org_id);
      if (error) throw error;
      return res.status(200).json({ ok: true, deleted: 'org', org_id });
    }

    if (action === 'list_users') {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) throw error;
      // pair each user with their org membership (if any)
      const { data: mems } = await admin
        .from('org_members')
        .select('user_id, role, organizations(name)');
      const byUser = {};
      (mems || []).forEach((m) => { byUser[m.user_id] = { org: m.organizations?.name, role: m.role }; });
      const users = data.users.map((x) => ({
        id: x.id,
        email: x.email,
        created_at: x.created_at,
        last_sign_in_at: x.last_sign_in_at,
        org: byUser[x.id]?.org || null,
        role: byUser[x.id]?.role || null,
      }));
      return res.status(200).json({ users });
    }

    if (action === 'delete_user') {
      const { user_id } = req.body;
      if (!user_id) return res.status(400).json({ error: 'user_id required' });
      if (user_id === u.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
      // remove their owned rows explicitly (FKs also cascade on auth delete)
      await admin.from('assessments').delete().eq('owner_id', user_id);
      await admin.from('members').delete().eq('owner_id', user_id);
      await admin.from('teams').delete().eq('owner_id', user_id);
      await admin.from('org_members').delete().eq('user_id', user_id);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) throw error;
      return res.status(200).json({ ok: true, deleted: 'user', user_id });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
