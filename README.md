# RampIQ — real auth + per-trainer isolation + Workday

Each trainer signs in and sees **only their own** teams, rosters, and assessments.
Enforced server-side by Supabase Row Level Security — not just hidden in the UI.

```
public/index.html   → app (auth gate + dashboard/teams/assess/reports/connections)
api/hr.js           → connect + roster pull, authenticated per user
db/schema.sql       → tables + RLS policies
package.json        → serverless deps (@supabase/supabase-js)
vercel.json
```

## Setup — 3 steps you do once

### 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → paste **db/schema.sql** → Run. (Creates tables + RLS.)
3. Settings → API → copy the **Project URL** and **anon public key**.
4. In `public/index.html`, find the CONFIG block near the bottom and set
   `SUPABASE_URL` and `SUPABASE_ANON`. (The anon key is safe to ship — RLS protects data.)
5. Authentication → Providers → Email is on by default. For instant testing,
   turn OFF "Confirm email" so sign-ups log in immediately.

### 2. Vercel
Push this folder to your repo → import in Vercel → point fsspl.xyz at it.
Set Environment Variables (Settings → Environment Variables):
```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...        # service_role key — server only, NEVER in frontend
WORKDAY_CLIENT_SECRET=...            # the secret half of Workday OAuth
MCP_API_KEY=...                      # if using an MCP/HR source
```

### 3. Workday (when ready)
In Workday, register an API Client for Integrations (OAuth 2.0, client-credentials).
You get a Client ID + Client Secret and your tenant + base URL.
- Put the **secret** in Vercel as `WORKDAY_CLIENT_SECRET`.
- Enter base URL, tenant, and Client ID in the app: **Connections → Add → Workday**.
  The app verifies the credentials before saving the connection.
- Then **Teams → Create team → pick the Workday connection** to pull a roster.

> The worker API path in `api/hr.js` (`/ccx/api/staffing/v6/...`) may need adjusting
> to match your tenant's enabled REST endpoints. That's the one line to tweak.

## How isolation works
- Every row carries `owner_id = auth.uid()`.
- RLS policies allow each user to read/write **only** their own rows.
- The `/api/hr` function verifies the caller's Supabase token before doing anything.
- Two trainers can never see each other's data, even via the API.

## Later: let managers see their team's trainers
Right now isolation is strict (each trainer = an island). To give managers a
roll-up across their reports, add a `manager_id` column + a second RLS policy.
Say the word and I'll add the org-hierarchy layer.
