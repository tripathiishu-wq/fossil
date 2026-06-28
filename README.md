# RampIQ — Speed to Proficiency (fsspl.xyz)

SaaS tool for assessing sales-trainee speed to proficiency. Single-page frontend
(works offline via localStorage) + Vercel serverless stubs for Workday / MCP HR pulls.

## Structure
```
public/index.html   → the whole app (Dashboard, Teams, Assess, Reports, export)
api/roster.js       → serverless: pulls a roster from Workday or an MCP/HR tool
vercel.json         → routing
```

## Run / deploy
- Local: open `public/index.html` directly — it works (mock roster, CSV+PDF export).
- Deploy: push this folder to your repo → import in Vercel → set domain to fsspl.xyz.
  The `/api/roster` function deploys automatically.

## Connect Workday (when ready)
Set these in Vercel → Settings → Environment Variables:
```
WORKDAY_BASE_URL=https://wd2-impl-services1.workday.com
WORKDAY_TENANT=your_tenant
WORKDAY_CLIENT_ID=...
WORKDAY_CLIENT_SECRET=...
```
Until set, the endpoint returns mock data so the product stays demoable.
Adjust the worker API path in `api/roster.js` to match your tenant's REST endpoint.

## Connect another HR tool via MCP
```
MCP_SERVER_URL=https://your-mcp-host
MCP_API_KEY=...
```
The stub calls a `list_employees` tool; rename/reshape to match your MCP server.

## Features
- **Dashboard** — org-wide stats, proficiency mix, per-team rollups
- **Teams** — Create team → pull roster (selectable fields: name/ID required, start/role/manager/cert/quota optional)
- **Assess** — score against ramp curve (velocity 60% + quality 40%); name shows on every result
- **Reports** — all assessments; export individual / team / org as CSV or PDF

## Scoring
Composite = ramp velocity (60%) + quality signals (40%).
Velocity rewards hitting milestones at/ahead of benchmark week.
Bands: Proficient ≥78, Developing 55–77, Lagging <55. Tune in `index.html` (`MILES`, `score()`).
