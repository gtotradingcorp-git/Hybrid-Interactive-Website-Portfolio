# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a production-ready executive portfolio website for John Michael L. Libao — Head IT Digital Transformation & Program Director.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (api-server artifact, not used by portfolio)
- **Database**: PostgreSQL + Drizzle ORM (provisioned but not used by portfolio)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`

## Artifacts

### Portfolio Website (`artifacts/portfolio/`)
- **Type**: React + Vite SPA
- **Preview Path**: `/`
- **Port**: 21113
- **Subject**: John Michael L. Libao (Quezon City, Philippines)
- **Contact**: cs_info@agentmail.to | linkedin.com/in/jlibao14

#### Pages
- `/` — Home (hero, impact metrics, expertise areas, featured projects, CTAs)
- `/about` — About & Leadership Narrative (career timeline across 5 roles, leadership principles)
- `/portfolio` — Filterable project grid (filter: All, ERP, Cloud, Integration, Governance)
- `/portfolio/:id` — Dynamic Project Detail (problem, solution, tech stack, metrics, company, role)
- `/capabilities` — Capabilities deep-dive (ERP & Digital Transformation, DevOps & Software Engineering, Cloud & Infrastructure, Systems Integration & Architecture, IT Governance & Compliance). Live demos on this page support shareable session links via URL query params (`?demo=<slug>&state=<base64>#live-demos`). Sharing encodes the current localStorage state into a base64 payload; recipients see an import banner if they already have local state, or auto-load otherwise.
- `/contact` — Client-side contact form with validation

#### AI Chat Assistant
- Floating chat widget (`src/components/chat/ChatWidget.tsx`) mounted globally in `App.tsx`
- Streams responses from OpenAI (gpt-4o-mini) via the API server's `POST /api/chat` endpoint (SSE)
- Knowledge base lives in `artifacts/api-server/src/lib/knowledgeBase.ts` (system prompt with John's bio + project highlights)
- Conversation is held in component state only (not persisted across page reloads)
- **Action-capable tools** — the model can propose four tools and the visitor confirms them inline via `ActionCard`:
  - `book_meeting` — emails recruiter + CCs John, attaches an .ics invite when the time parses.
  - `send_brief` — generates a tailored one-page PDF (`lib/briefPdf.ts`), emails the recruiter, and offers an in-chat download via `GET /api/chat/brief/preview`.
  - `alert_john` — sends a hot-lead alert to John and writes a row to `hot_leads`.
  - `share_with_panel` — emails 1–3 panellists with a curated pitch (top proof projects + brief link).
- Each action: validated server-side, rate-limited per IP (5/min, 30/day), audited in `chat_actions`, and surfaced in the admin dashboard's "Chat actions" + "Hot leads" cards. Nothing is sent until the visitor clicks Confirm.

#### Professional Background (from resume + LinkedIn)
- **Current Title**: Head IT Digital Transformation & Program Director (GTO Trading Corporation, Nov 2025 - Present)
- **Experience**: 10+ years (2010 - Present)
- **Key Employers**: GTO Trading Corporation (current), Chris Sports Inc. (Retail), Lee Designs Inds., JML Freelance Consulting, Ventaja International Corp./PAYREMIT (Fintech), VXI Global Solutions (BPO, 8+ yrs), Main Hardware Inc. (BSP/JP Morgan/Emerson), Systems Variable Technicom, Gawad Kalinga Foundation
- **Entrepreneurship**: Co-Founder of Mikaela's AguaBest Water Distribution Services (Oct 2021 - Jul 2025)
- **Key Roles**: Head IT Digital Transformation & Program Director, IT Manager, IT Consultant - Solutions Architect, IT Consultant - Engineering Head, Senior Dev & IT Ops Engineer, Senior Software Engineer, MIS Analyst, IT Technical Project Manager, Partnerships Manager
- **Core Competencies**: Strategic Planning, Executive Reporting, ERP, DevOps & CI/CD, Cloud Infrastructure, IT & Security Governance, Solution Architecture, Program Management, Vendor & Budget Management, Digital Transformation, Data Privacy Act, AI Integrations

#### Key Files
- `src/data/projects.ts` — Data layer with 21 projects (infrastructure, ERP, software dev, governance)
- `src/components/layout/Navbar.tsx` — Sticky nav with mobile hamburger
- `src/components/layout/Footer.tsx` — Site footer with navigation + social links + demo tracking opt-out toggle
- `src/components/ui/ProjectCard.tsx` — Reusable project card (shows company & role)
- `src/components/ui/MetricCard.tsx` — Animated metric display
- `src/index.css` — Full CSS theme (dark-mode-first, deep navy/gold palette)

#### Design
- Dark-mode-first executive color palette (deep navy + gold accent)
- Framer Motion animations (scroll-triggered, staggered entrances)
- Fully responsive (mobile hamburger menu, responsive grids)
- No emojis used

### API Server (`artifacts/api-server/`)
- **Type**: Express 5 API
- **Preview Path**: `/api`
- **Endpoints**:
  - `POST /api/contact` — Receives contact form submissions and sends email via AgentMail API to `cs_info@agentmail.to`
  - `POST /api/chat` — SSE-streaming chat endpoint backed by OpenAI gpt-4o-mini (Replit AI Integrations). Sends OpenAI tool definitions for the four AI OPHNM actions; tool-call deltas are accumulated and surfaced as a single `action_request` SSE event for in-chat confirmation. Topic labels for the chat history are produced by `topicClassifier.ts` (gpt-4o-mini), with an in-memory LRU+TTL cache (cap 500 entries / 1h) so repeat questions skip the extra classifier call. Only successful AI labels are cached; upstream failures and unrecognized labels fall through without poisoning the cache.
  - `POST /api/chat/actions/{book_meeting|send_brief|alert_john|share_with_panel}` — confirmed-action endpoints. Validate the model's arguments, rate-limit per IP, send via AgentMail (CC `cs_info@agentmail.to`), and write an audit row to `chat_actions` (plus `hot_leads` for `alert_john`).
  - `GET /api/chat/brief/preview` — re-renders the tailored one-page PDF for in-chat download after `send_brief` succeeds.
  - `GET /api/admin/chat-actions` and `GET /api/admin/hot-leads` — admin-only audit endpoints feeding the new dashboard cards.
  - `POST /api/demo-events` — Records anonymous interaction telemetry from the Live Capability Demos. Body: `{ demo: "ticketing"|"erp"|"bi", event: "first_interaction"|"ticket_created"|"stock_adjusted"|"range_changed"|"export_clicked"|"project_link_clicked"|"invoice_generated" }`. No PII stored. Per-IP rate limited to 60 requests/minute via the durable Postgres limiter; soft-fails (HTTP 202) on DB errors so demos never break.
  - `GET /api/admin/demo-events?windowDays=N` — Admin-only summary (1–90 days, default 30) returning `{ windowDays, periodStart, periodEnd, byDemo: [{ demo, total, events: { ... } }], dailyByDemo: { [demo]: [{ day, count }] } }`. The `dailyByDemo` field provides a day-by-day interaction count per demo (zero-filled for the entire window). Surfaced in the AdminUsage dashboard as the "Live demos engagement" card with per-demo mini bar charts (recharts).
  - `GET /api/healthz` — Health check
- **Scheduled Jobs**:
  - **Weekly Digest** — durable scheduler (`digestScheduler.ts`) sends a usage digest email on a configurable weekday/hour cadence. State in `digest_schedule` table.
  - **Demo Events Purge** — lightweight scheduler (`demoPurge.ts`) runs every 24 hours and deletes `demo_events` rows older than 120 days. The dashboard only queries the last 90 days, so the 120-day retention window provides a comfortable buffer. Logs purge counts; errors are caught and retried on the next cycle.
- **Dependencies**:
  - AgentMail integration (API key stored in `AGENTMAIL_API_KEY` env var)
  - OpenAI via Replit AI Integrations (env: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm test` — run every workspace package's tests in one shot (alias for `pnpm -r --if-present run test`). The same command runs in the CI `test` job (`.github/workflows/ci.yml`) on every push to `main` and on every pull request, alongside `pnpm install --frozen-lockfile` and `pnpm run typecheck`. A separate `e2e` job in the same workflow installs Chromium (cached across runs) and runs `pnpm --filter @workspace/portfolio run test:e2e`, so both unit and e2e regressions are caught before merge. After every e2e run, an Allure report is generated with historical trend data from previous runs and deployed to GitHub Pages (main branch only). The raw Allure results are also uploaded as a CI artifact (7-day retention) for pull request runs. The historical Allure dashboard lives at `https://<owner>.github.io/<repo>/` and shows pass/fail trends, flaky test detection, and per-test duration graphs across builds.
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run test` — run API server tests (node:test, no extra deps; covers chat route + SSE parser)
- `pnpm --filter @workspace/portfolio run dev` — run portfolio locally
- `pnpm --filter @workspace/portfolio run test:e2e` — run Playwright e2e tests for the live demos on `/capabilities` (requires `PLAYWRIGHT_BROWSERS_PATH` pointing to the Chromium cache, and the dev server either running or launched by Playwright's `webServer` config). Produces both HTML and Allure results (in `allure-results/`)

## Branch Protection (GitHub)

The repository `gtotradingcorp-git/Hybrid-Interactive-Website-Portfolio` on GitHub is **public** and has a **repository ruleset** named "Protect main" (ID 15561483) that enforces merge requirements on the `main` branch:

- **Require a pull request before merging** — direct pushes to `main` are blocked.
- **Required status checks** — the CI workflow's `typecheck + test` and `e2e tests` checks (from `.github/workflows/ci.yml`) must pass before a PR can merge.
- **Strict status check policy** — branches must be up to date with `main` before merging, so checks always run against the latest code.
- **No bypass actors** — nobody can bypass these rules (`current_user_can_bypass: never`).

The ruleset is managed via the GitHub Rulesets API (Settings > Rules > Rulesets in the UI). View or edit it at: `https://github.com/gtotradingcorp-git/Hybrid-Interactive-Website-Portfolio/rules/15561483`

Anyone re-creating the repo (or a fork) needs to set up the ruleset again. Without it, GitHub will happily merge a PR even when CI is red.

## E2E Test Report History (Allure + GitHub Pages)

The CI `e2e` job generates an Allure report after every run (pass or fail) and deploys it to GitHub Pages on the `gh-pages` branch. Each deploy merges the previous report's history so the dashboard accumulates trend data across builds.

**GitHub Pages setup**: In the repo's Settings > Pages, set the source to "Deploy from a branch" and select the `gh-pages` branch / `/ (root)`. The `gh-pages` branch is created automatically on the first successful main-branch CI run by the `peaceiris/actions-gh-pages` action.

The report URL is `https://<owner>.github.io/<repo>/` and provides:
- Pass/fail trend charts across builds
- Flaky test detection (tests that flip between pass and fail)
- Per-test duration graphs to spot performance regressions
- Drill-down into individual test results with traces and screenshots
