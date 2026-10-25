# HerWay AI

HerWay AI is a mobile-first web app based on the supplied HTML prototype. It keeps the original dark navy, lantern-gold, card-based interface and main flows. This implementation uses vanilla JavaScript and CSS, an Express API, Supabase Auth/PostgreSQL, and optional Mapbox directions.

## What works

- Supabase email/password sign-up, sign-in, sign-out, and refresh-token session renewal.
- Private profile and preferences, trusted-contact records, incident reports, and journeys stored in Supabase.
- User-only CRUD for Guardians and incident reports; server-side ownership checks on every API request.
- A Guardian can see a journey only when the journey owner selected their contact and the Guardian signs in with the exact shared email address.
- Route alternatives with real addresses, distances, and durations when a Mapbox token is configured.
- Manual journey completion and arrival-time extension.
- Emergency Mode can save an urgent incident or display saved contact information.
- Fixed assistant answers that accurately describe the configured features.

## Safety and integration limits

The supplied prototype did not provide real routing, notifications, emergency calls, verified Safe Point data, or live location tracking. This app does not invent these. Mapbox directions are travel directions, not safety ratings; transit mode currently uses Mapbox driving directions and is labeled accordingly. Starting a journey stores the trip and its selected contacts, but does not send alerts or collect location. Emergency Mode cannot contact emergency services. Urgent reports are stored in the user's account only. Guardian contacts are not invited automatically. The app is not an emergency service.

Incident reports are sensitive personal data. Configure Supabase access carefully, use HTTPS, limit access to the project, and establish an appropriate retention policy before inviting real users. The server uses a Supabase service-role key to support the API; that key bypasses RLS, remains server-side, and every API query is scoped to the authenticated user or explicitly shared email. Supabase documents that service-role keys bypass RLS, so never expose this key in the browser.

## Structure

```text
outputs/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server/
│   ├── index.js
│   ├── middleware/auth.js
│   └── routes/api.js
├── supabase/schema.sql
├── .env.example
├── .gitignore
├── package.json
├── render.yaml
└── vite.config.js
```

## Local setup

Requirements: Node.js 20.19 or later, npm, and a Supabase project. The web app starts without credentials, but authenticated features return a configuration error until Supabase is configured.

1. Open a terminal in this project folder and install dependencies:

   ```sh
   npm install
   ```

2. Create a Supabase project at [supabase.com](https://supabase.com/). In **Project Settings → API**, copy the Project URL, anon/public key, and service_role key.

3. In the Supabase dashboard, open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and run it. It creates the tables, indexes, constraints, grants, and Row Level Security policies. It inserts no user or sample records.

4. Copy `.env.example` to `.env` in this folder and fill in:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Supabase Project URL from Project Settings → API |
   | `SUPABASE_ANON_KEY` | Supabase anon/public key from Project Settings → API. This key is intentionally returned to the browser for Supabase Auth; access is protected by Auth and RLS. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key from Project Settings → API. Keep it only in the server environment; never put it in frontend code or commit it. |
   | `MAPBOX_ACCESS_TOKEN` | Optional Mapbox access token. Required to enable actual route alternatives. Keep it server-side. |
   | `CLIENT_ORIGIN` | Local frontend origin, normally `http://localhost:5173`. For multiple origins, use comma-separated exact origins. |
   | `PORT` | Optional Express port; defaults to `3000`. |
   | `NODE_ENV` | Set to `development` locally and `production` on the host. |

5. In Supabase **Authentication → URL Configuration**, set the Site URL to `http://localhost:5173` for local work and add that origin to allowed redirect URLs. Enable email/password sign-in and configure email confirmation/delivery to suit your project.

6. Start both servers:

   ```sh
   npm run dev
   ```

   Open `http://localhost:5173`. Vite proxies `/api`, `/config`, and `/health` to Express. For a production-style local run, use `npm run build` followed by `npm start`, then open `http://localhost:3000`.

## Verification commands

```sh
npm run check
npm run build
```

`npm run check` checks JavaScript syntax and creates the production frontend bundle. API/database integration requires working Supabase credentials, the SQL schema above, and a test account. Route lookup additionally needs a valid Mapbox token. Verify sign-up, email confirmation, sign-in/sign-out, profile save, Guardian CRUD, route lookup, journey start/check-in, incident CRUD, Guardian access with the selected email, and unauthorized requests in your configured environment. No deployment or external service has been configured from this folder.

## Deploy with GitHub and Render

This repository uses one Render Node web service to host Express and the built static frontend at the same origin. That keeps the API, frontend, CORS, and auth configuration simple for this app. The Blueprint selects Render's free instance for preview/testing. Render says free web services spin down after 15 idle minutes and recommends against using them for production; upgrade to a paid instance before relying on this app for real journeys or reports ([current Render limitations](https://render.com/docs/free)).

1. Create a private GitHub repository. From this `outputs` folder, run:

   ```sh
   git init
   git add .
   git commit -m "Build HerWay AI full-stack app"
   git branch -M main
   git remote add origin https://github.com/YOUR_ACCOUNT/herway-ai.git
   git push -u origin main
   ```

   `.gitignore` excludes `.env`. Confirm it is not in the commit before pushing.

2. In Render, choose **New → Blueprint**, connect the GitHub repository, and select `render.yaml`. Render reads the build/start commands and creates the web service. If prompted, set the missing secret environment variables in the service dashboard.

3. In Render **Environment**, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`. Set `CLIENT_ORIGIN` to the exact HTTPS Render service URL shown in the dashboard (no trailing slash), and set `MAPBOX_ACCESS_TOKEN` if you want real directions. Render supplies `PORT`; do not override it unless necessary. The service sets `NODE_ENV=production`.

4. In Supabase **Authentication → URL Configuration**, replace the local Site URL with the Render URL (for example `https://herway-ai.onrender.com`) and add `https://YOUR-RENDER-HOST/*` under allowed redirect URLs. Configure Supabase email templates/delivery as needed.

5. Wait for Render's deploy to finish. Open `https://YOUR-RENDER-HOST/health` and confirm it returns `{"status":"ok"}`, then open the base URL and create an account. Complete email confirmation if enabled.

6. Check profile update, Guardian and report CRUD, route lookup if configured, journey check-in, sign-out, and Guardian visibility from a separate account using the selected email. Check that an unauthenticated `/api/me` request returns 401. Never use the service-role key in browser code.

After setup, each push to the connected branch triggers a Render build and deploy. Check the Render deploy log and `/health` after changes. Apply reviewed SQL migrations in the Supabase SQL Editor before deploying code that depends on them.

## Before sharing the public URL

- [ ] Schema has been applied to the intended Supabase project.
- [ ] Supabase email confirmation and delivery work.
- [ ] Render environment variables point to that same Supabase project.
- [ ] The health endpoint and public frontend load over HTTPS.
- [ ] Account isolation, selected Guardian email access, report privacy, and sign-out were verified with real test accounts.
- [ ] Mapbox directions were verified if configured; otherwise route planning clearly reports that it is unavailable.
- [ ] Contact invitations, notifications, live tracking, emergency calling, verified Safe Points, and AI risk assessments are not advertised as available.
- [ ] Privacy notice, data retention, operational response process, and local emergency information are ready before public use.
