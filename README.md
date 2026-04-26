# John Libao — Executive Portfolio

[![CI](https://github.com/john-libao/AIIntegratedWebsitePortfolio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/john-libao/AIIntegratedWebsitePortfolio/actions/workflows/ci.yml)

A production-ready executive portfolio website for **John Michael L. Libao**, Head IT Digital Transformation & Program Director. Built as a pnpm monorepo with React, Vite, and TypeScript.

## Tech Stack

- **Runtime:** Node.js 24
- **Package Manager:** pnpm (workspaces)
- **Language:** TypeScript 5.9
- **Frontend:** React + Vite (SPA)
- **Animations:** Framer Motion
- **API:** Express 5 (provisioned, not used by the portfolio)
- **Database:** PostgreSQL + Drizzle ORM (provisioned, not used by the portfolio)
- **Validation:** Zod

## Project Structure

```
├── artifacts/
│   ├── portfolio/        # React + Vite portfolio website (main app)
│   └── api-server/       # Express 5 API server
├── lib/
│   ├── api-client-react/  # Generated React Query hooks
│   ├── api-spec/          # OpenAPI specification + codegen
│   ├── api-zod/           # Zod schemas for API validation
│   └── db/                # Drizzle ORM schema + migrations
└── scripts/               # Build and utility scripts
```

## Portfolio Pages

| Route              | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| `/`                | Home — hero section, impact metrics, expertise areas, featured projects |
| `/about`           | Leadership narrative and career timeline                         |
| `/portfolio`       | Filterable project grid (ERP, Cloud, Integration, Governance)    |
| `/portfolio/:id`   | Project detail — problem, solution, tech stack, metrics          |
| `/capabilities`    | Deep-dive into core competency areas                             |
| `/contact`         | Contact form with client-side validation                         |

## Getting Started

### Prerequisites

- Node.js 24+
- pnpm

### Install Dependencies

```bash
pnpm install
```

### Development

Run the portfolio site locally:

```bash
pnpm --filter @workspace/portfolio run dev
```

Run the API server locally (requires the `PORT` environment variable):

```bash
PORT=3000 pnpm --filter @workspace/api-server run dev
```

### Build

```bash
pnpm run build
```

### Type Checking

```bash
pnpm run typecheck
```

### Other Commands

```bash
# Regenerate API client hooks from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Push database schema changes (development only)
pnpm --filter @workspace/db run push
```

## Design

The portfolio uses a dark-mode-first executive color palette with deep navy backgrounds and gold accents. Scroll-triggered Framer Motion animations and staggered entrance effects provide a polished feel. The layout is fully responsive with a mobile hamburger menu and adaptive grids.

## Deployment

The project is hosted on Replit and can be published directly from the workspace.

1. Run a production build to ensure everything compiles cleanly:

   ```bash
   pnpm run build
   ```

2. The portfolio is a static SPA — the build output in `artifacts/portfolio/dist/` is the deployable artifact. Replit's deployment system serves it automatically.

3. The API server (`artifacts/api-server/`) is built separately and served under the `/api` path prefix. If your deployment does not require an API, the portfolio runs independently as a frontend-only app.

4. If using the database or API server in production, ensure the `DATABASE_URL` environment variable is set and database migrations are applied via `pnpm --filter @workspace/db run push`.

## License

MIT
