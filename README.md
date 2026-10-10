# SegueIT Project Tracker

Work-management platform by SegueIT — plan, track and deliver projects from a colorful,
inline-editable main table, with Kanban boards, Gantt charts, milestones, issue tracking,
timesheets with approvals, dashboards and portfolio reporting.

| Layer    | Stack                                                                 |
| -------- | --------------------------------------------------------------------- |
| Web      | Next.js 15 (App Router), React 19, TanStack Query, Tailwind CSS 4, Recharts, dnd-kit |
| API      | NestJS 11, Prisma 6, Passport JWT, class-validator, Swagger, Throttler, Event Emitter |
| Database | PostgreSQL (Supabase in production)                                   |
| Email    | SMTP via Nodemailer: invitations and password resets                  |

---

## Quick start

Requirements: **Node.js ≥ 20.11**, npm and a PostgreSQL database (`docker compose up -d db` starts one
that matches the defaults in `apps/api/.env.example`).

```bash
docker compose up -d db
npm run setup   # creates env files with random secrets, installs, creates & seeds the DB
npm run dev     # syncs env + DB schema, then API on http://localhost:4000, web on http://localhost:3000
```

The seed creates two kinds of account (values from `apps/api/.env`):

- **Root admin** (`ROOT_ACCOUNT` in `apps/api/prisma/seed-data.ts`, overridable with `ROOT_EMAIL` / `ROOT_PASSWORD`)
  opens the **Platform console** at `/platform`. Root admins create organizations, appoint their project
  coordinators and add other root admins (**Platform → Root admins**).
- With `SEED_DEMO_DATA=true`, a demo organization is created too: its first **Project coordinator** and the shared
  demo-user password are defined in `DEMO_ORGANIZATION` (e.g. `priya.sharma@segueit.com`).
- Change these first-run passwords after signing in.

**Change these values before any real deployment.**

## Accounts and roles

| Account | Scope | Can do |
| ------- | ----- | ------ |
| **Root admin** | Whole platform, no organization | Creates, renames, suspends and deletes organizations and is the **only** role that appoints (or changes) **project coordinators**. Adds, deactivates and reactivates other root admins (at least one always stays active). Can open any organization's workspace with every coordinator permission. |
| **Project coordinator** | One organization | Creates projects and adds members to them, manages every project, creates and manages **member** accounts, schedules meetings, sees every member's details (People), approves time, reports and settings. |
| **Member** | One organization | Sees only the projects they belong to and works on their items (tasks, issues, comments, time). |

Roles from earlier versions are upgraded automatically by the seed (Super Admin/Admin → Project coordinator,
Employee → Member).

### Invitations and passwords

- When a root admin, coordinator or member account is created **without** an initial password, the person
  receives an invitation email with a link to choose their own (valid `INVITE_EXPIRES_HOURS`, default 72).
  Invitations can be re-sent from **Settings → Users**, the organization drawer, or **Platform → Root admins**.
- Everyone can change their password under **Profile**.
- **Forgot password?** on the sign-in screen emails a single-use reset link (valid
  `PASSWORD_RESET_EXPIRES_MINUTES`, default 60). Setting a new password signs the account out everywhere.
- Email goes out over SMTP (`SMTP_*` and `MAIL_FROM` in `apps/api/.env`). Without `SMTP_HOST`, development
  servers write emails (with their links) to the API log; production servers refuse to send invitations.

API documentation (Swagger) is served at `http://localhost:4000/api/docs` when `SWAGGER_ENABLED=true`.

### Run with Docker

Requirements: **Docker** with Docker Compose. No Node.js needed.

```bash
docker compose up --build
```

Open http://localhost:3000 and sign in with the root admin from `apps/api/prisma/seed-data.ts`
(`ROOT_ACCOUNT`), then create organizations from the Platform console. Change its password after signing in.
Data is kept in the `db-data` volume (PostgreSQL); JWT secrets are generated on first start and kept in `api-data`.

Change settings with environment variables or a `.env` file next to `docker-compose.yml`:

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `SEED_DEMO_DATA` | `false` | `true` adds a demo organization with sample users and projects (`DEMO_ORGANIZATION` in seed-data.ts) |
| `WEB_PORT` | `3000` | Port on your machine |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |
| `APP_NAME`, `BRAND_COLOR` | SegueIT Projects, `#0b5cad` | Branding (rebuild after changing) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | generated | Provide your own to manage secrets yourself |

The `Dockerfile` has two targets, `api` and `web`, if you want to build the images separately
(`docker build --target api .`). Web settings starting with `NEXT_PUBLIC_` and `API_PROXY_TARGET`
are fixed at build time, so pass them as `--build-arg`.

### Production

```bash
npm run build
npm start
```

Set `NODE_ENV=production`, `COOKIE_SECURE=true` (HTTPS), real `CORS_ORIGINS`, strong JWT secrets
(required, at least 32 characters), `DATABASE_URL` / `DIRECT_URL`, `APP_URL` and the `SMTP_*` settings.

### Deploying on Vercel with Supabase

1. In Supabase, open **Connect** and copy two connection strings, appending `schema=ptms` to each:
   - `DATABASE_URL`: transaction pooler (port 6543) + `?pgbouncer=true&connection_limit=1&schema=ptms`
   - `DIRECT_URL`: session pooler (port 5432) + `?schema=ptms`
2. Create the tables and the first root admin once, from your machine, with those two values in `apps/api/.env`:
   `npm run db:setup -w @segueit/api` (keep `SEED_DEMO_DATA=false`).
3. In the Vercel project settings add `DATABASE_URL`, `DIRECT_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
   (e.g. `openssl rand -hex 48`), `APP_URL` (your site address), `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`,
   `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`, then redeploy.

---

## Features

- **Home** – personal greeting, quick stats, recent projects, your upcoming work, latest updates and milestones.
- **Main table** – each project opens on a table of colored, collapsible **groups**: inline-edit the task name, owners, status and priority (full-color labels), timeline and estimate; quick-add tasks per group; per-group summaries (status/priority distribution, date range, total estimate, average progress); rename, recolor and delete groups.
- **Sidebar** – your projects and **Favorites** (star any project), with a filter for long lists.
- **My work** – everything assigned to you, grouped into Past dates, Today, This week, Next week, Later and Without a date, with inline status changes.
- **Projects** – portfolio grid/table, status, owner, budget, timeline, color, archive/restore, members with project roles (Manager / Member / Viewer).
- **Tasks** – groups, subtasks, assignees, priorities, estimates, progress, start/due dates, dependencies (with cycle detection), updates (comments), time logged.
- **Kanban** – drag & drop across configurable statuses with persistent ordering.
- **Calendar** – a global calendar (`/calendar`) plus month views per project and in My work; tasks span start → due date (or show on their due date only), drag a day to reschedule, drag from the Unscheduled tray to plan.
- **Meetings** – coordinators and root paste a meeting link with its time, choose **Internal** or **Client** (each has its own colour) and who sees it (one project's members or the whole organization). Everyone who can see a meeting gets a notification on the morning of the meeting (`MEETING_DIGEST_HOUR`, organization time zone).
- **People** – coordinators and root open any member to see their projects, open tasks and issues, time logged and recent activity.
- **Workload** – estimated hours per person per week against capacity (working hours × 5), colour-coded with the items behind each cell.
- **Custom columns** – per project: text, numbers, dropdown (coloured choices), checkbox, date, link, tags and rating; edited inline on the main table with group totals.
- **Automations** – "when … then …" rules per project: when an item is created, its status or priority changes or someone is assigned, set status/priority, assign, move to a group, set a due date, or notify people. Recipes included; chains stop after 3 levels.
- **Gantt** – day/week/month zoom, dependency arrows, milestones, today marker, drag to reschedule and resize.
- **Milestones** – timeline view with completion tracking and task-based progress.
- **Issues** – bug tracker with configurable statuses, severities, priorities, assignee and due dates.
- **Timesheets** – log time against projects/tasks, billable flag, approval workflow, daily charts.
- **Dashboards** – organization dashboard and per-project overview (status mix, priorities, workload, budget burn).
- **Reports** – portfolio health (on track / at risk / off track) with CSV export, resource utilization vs capacity, time analysis, issue trends.
- **Activity & notifications** – audit trail per project and in-app notifications: task/issue assignment, task and issue status changes, due date changes, new comments (creator, assignees and everyone in the thread), added to / removed from a project, time submitted for approval and reviewed, due today/tomorrow and overdue reminders (hourly, in the organization's timezone), and the morning notice for today's meetings.
- **Administration** – users & roles (Project coordinator, Member), organization name and default brand color, timezone, working hours and fully configurable workflows.
- **Platform console (Root)** – overview, organizations (create with their first project coordinator, add coordinators, suspend, delete).
- **Appearance** – Claymorphic (cream, default) or Classic style, per-user light/dark/system theme, accent color, font (Figtree, Inter, Geist, IBM Plex Sans, Manrope), density, corner radius, light/dark sidebar, and a collapsible sidebar (Ctrl/⌘+B).
- **Security** – httpOnly cookie auth, short-lived access tokens, rotating refresh tokens with reuse detection, bcrypt, Helmet, rate limiting, strict DTO validation, RBAC + project-level authorization, strict separation of platform (root) and tenant routes.

---

## Configuration — nothing is hard-coded

| Concern | Where it lives |
| ------- | -------------- |
| Branding (product name, logo files, brand color), API path, UI defaults, date formats | `apps/web/.env.local` (see `.env.example`); logo files in `apps/web/public/brand/` |
| Main table columns | `apps/web/src/features/tasks/components/table/table-columns.ts` |
| Group color palette | `apps/web/src/features/task-lists/group-colors.ts` (UI) and `apps/api/src/features/task-lists/task-list.colors.ts` (defaults for new groups) |
| Ports, CORS, secrets, cookies, rate limits, pagination | `apps/api/.env` (validated with Zod at boot) |
| Root admin, demo organization, demo data | `apps/api/prisma/seed-data.ts`; `SEED_DEMO_DATA` in `apps/api/.env` |
| Hour of the morning meeting notice | `MEETING_DIGEST_HOUR` in `apps/api/.env` |
| Statuses, priorities, severities | Database, per organization — **Settings → Workflow** |
| Org name, default brand color, timezone, week start, working hours | Database — **Settings → Organization** |
| Personal theme, accent, font, density, radius, sidebar | Browser storage — **Settings → Appearance** (options in `apps/web/src/shared/theme/theme.config.ts`) |
| Role → permission matrix | `apps/api/src/common/constants/permissions.constants.ts` (served to the UI via `/auth/me`) |
| Defaults for new organizations | `apps/api/src/features/lookups/lookup.defaults.ts`, `features/organizations/organization.defaults.ts` |

### Database

The API uses PostgreSQL. `DATABASE_URL` is the connection the app uses (pooled in production) and
`DIRECT_URL` the one `prisma db push` uses. Locally both can point at the same database. Run
`npm run db:setup` after changing the schema or pointing at a new database.

---

## Project structure

Both apps are organized **by feature**; each feature owns its API calls, types and components.

```
apps/
├─ api/                         NestJS REST API
│  ├─ prisma/                   schema.prisma, seed.ts, seed-data.ts
│  └─ src/
│     ├─ config/                typed configuration + env validation
│     ├─ common/                guards, decorators, filters, events, pagination, validation
│     ├─ prisma/                PrismaService
│     └─ features/
│        ├─ auth/  users/  organizations/  platform/  lookups/
│        ├─ projects/  task-lists/  tasks/  milestones/  issues/  comments/  meetings/
│        ├─ timesheets/  activity/  notifications/
│        └─ dashboard/  reports/  health/
└─ web/                         Next.js App Router client
   └─ src/
      ├─ app/                   routes only (thin pages composing feature components)
      │  ├─ (auth)/login
      │  └─ (app)/home, my-work, projects/[projectId]/{(main table),board,gantt,overview,…}, timesheets, reports, settings, profile
      ├─ features/              auth, home, projects, tasks (incl. tasks/components/table), gantt,
      │                         milestones, issues, comments, timesheets, dashboard, reports,
      │                         activity, notifications, lookups, users, organization, task-lists, my-work
      └─ shared/                config, api client, UI kit, hooks, utils
```

The browser talks to the API through a same-origin Next.js rewrite (`/api/*`), so auth
cookies remain first-party and no API URL is exposed to client code.

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run setup` | Env files + install + database schema + seed |
| `npm run dev` | Run API and web in watch mode |
| `npm run build` / `npm start` | Production build / start |
| `npm run typecheck` | Type-check both apps |
| `npm test` | API unit tests |
| `npm run db:seed` | Seed (idempotent) |
| `npm run db:reset` | Drop, recreate and seed the database |
