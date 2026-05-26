# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

```
property-management/
├── backend/          Node.js + Express + Prisma API (port 4000)
├── frontend/         React + Vite + Tailwind UI (port 3000)
└── docker-compose.yml  PostgreSQL on 5432, pgAdmin on 5050
```

Node is installed at `C:\Program Files\nodejs\` but is not on the default shell PATH. Prefix every `npm`/`node`/`npx` command with:
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
```

---

## Commands

### Database
```powershell
docker compose up -d postgres          # start Postgres (required first)
```

### Backend (`cd backend`)
```powershell
npm install
npm run dev          # ts-node-dev, hot reload on :4000
npm run build        # compile to dist/
npm run db:migrate   # prisma migrate dev
npm run db:generate  # regenerate Prisma client after schema changes
npm run db:seed      # seed with 4 test users (manager/owner/tenant/vendor @example.com / password123)
npm run db:studio    # Prisma Studio GUI on :5555
```

### Frontend (`cd frontend`)
```powershell
npm install
# Start via the vite binary directly (npm run dev also works once PATH is set):
"C:\Program Files\nodejs\node.exe" node_modules\vite\bin\vite.js --port 3000 --host
npm run typecheck    # tsc --noEmit
npm run build        # production build to dist/
```

---

## Backend architecture

### Request lifecycle
Every request flows: `authenticate` middleware → `requireRole` middleware → controller → service → Prisma → `response` helper.

Controllers are thin — they parse/validate with **Zod**, call the service, and map domain errors to HTTP responses. All business logic lives in `*.service.ts`.

### Key files
| File | Purpose |
|------|---------|
| `src/lib/response.ts` | All API responses go through these helpers (`ok`, `created`, `paginate`, `notFound`, etc.). Every response envelope: `{ success, data, error, meta }` |
| `src/lib/jwt.ts` | `signAccessToken` / `verifyAccessToken` + refresh token helpers |
| `src/lib/crypto.ts` | AES-256-GCM encryption for PII fields (SSN, DOB, tax IDs). Use `encryptIfPresent` / `decryptIfPresent` |
| `src/middleware/auth.middleware.ts` | Attaches `req.user: JwtPayload` (`sub`, `role`, `managementCompanyId`, `email`) |
| `src/middleware/rbac.middleware.ts` | `requireManager`, `requireOwner`, `requireTenant`, `requireVendor`, `requireManagerOrOwner` |

### Multi-tenancy rule
**Every** Prisma query that touches tenant-specific data must include `managementCompanyId` in the `where` clause. Services receive `managementCompanyId` from `req.user.managementCompanyId` and scope all reads/writes to it. Violating this causes cross-tenant data leakage.

### Adding a new module
1. Create `src/api/v1/<module>/` with `<module>.service.ts`, `<module>.controller.ts`, `<module>.routes.ts`
2. Register the router in `src/api/v1/index.ts`
3. Routes use `authenticate` + `requireRole` middleware; controllers call the service and use response helpers

---

## Accounting engine rules

These are invariants — never break them:

- **All monetary amounts are integers (cents)**. `$12.50` is stored as `1250`. Never use floats.
- **Journal entries are immutable**. Never `UPDATE` or `DELETE` a posted `JournalEntry`. To correct an error, post a reversal entry and set `isReversed = true` + `reversedById` on the original.
- **Every financial mutation must post a balanced journal entry** (total debits = total credits) inside a `prisma.$transaction(...)`. See `accounting.service.ts` for the pattern.
- **Trust account funds are never commingled** with operating funds. Security deposits go to account code `1020` (Trust - Security Deposits); rent receipts go to `1010` (Trust - Rent). Never post tenant money to account `1000` (Operating).
- **Payment application is FIFO**: `recordPayment` in `accounting.service.ts` applies payments to outstanding `RentCharge` rows ordered by `dueDate ASC`. Do not change this ordering.
- Chart of accounts is seeded automatically in `auth.service.ts → seedChartOfAccounts()` when a `ManagementCompany` is created.

---

## Database schema key relationships

```
ManagementCompany
  ├── User (role: MANAGER | OWNER | TENANT | VENDOR)
  ├── Owner → Property[] → Unit[] → Lease → Tenant[]
  │                                       → RentCharge[]  (posted by scheduler)
  │                                       → Payment[]     → PaymentApplication[] (FIFO)
  ├── WorkOrder → Vendor → Invoice → InvoiceLineItem
  ├── Account (Chart of Accounts, seeded on company creation)
  └── JournalEntry → JournalLine[] (double-entry, immutable)
```

- `deleted_at` soft-delete on all tables — always filter `WHERE deleted_at IS NULL`
- `Unit.status` transitions to `OCCUPIED` / `VACANT` automatically when a lease is activated / terminated
- `Unit.vacant_since` is set automatically on vacancy; used to calculate days-vacant reports
- Work order status machine: `SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED → INVOICED → CLOSED` (or `DENIED`). Enforced in `maintenance.service.ts → validateStatusTransition`.

---

## Frontend architecture

### Portal routing structure
Four completely separate portals under distinct URL prefixes, each with its own layout and color scheme:

| Portal | Routes | Layout color |
|--------|--------|--------------|
| Manager | `/manager/*` | Slate/indigo sidebar |
| Tenant | `/tenant/*` | Teal, mobile bottom-nav |
| Owner | `/owner/*` | Green top-nav |
| Vendor | `/vendor/*` | Amber |

`ProtectedRoute` in `src/components/ProtectedRoute.tsx` checks `user.role` and redirects to the portal's login if mismatched.

### State & data fetching
- Auth state (tokens + decoded user) lives in Zustand: `src/store/auth.store.ts`. Persisted to `localStorage` as `pm-auth`.
- All server state uses **React Query**. Query keys should be descriptive arrays, e.g. `['properties']`, `['tenant-ledger']`.
- The Axios instance in `src/lib/api.ts` auto-refreshes the access token on 401 responses and calls `useAuthStore.getState().logout()` if refresh fails.
- Use the typed helpers `apiGet<T>`, `apiPost<T>`, `apiPatch<T>` — they unwrap the `{ success, data }` envelope automatically.

### UI conventions
- All monetary values display via `formatCents(cents: number)` from `src/lib/utils.ts`
- Status badges use `<StatusBadge status="ACTIVE" />` — mapping is in `src/components/ui/Badge.tsx`
- Loading skeletons: use `<Skeleton className="h-N" />` from `Card.tsx` while async data is pending
- New pages for the manager portal go in `src/portals/manager/pages/`. Add a `<Route>` in `App.tsx` and a nav entry in `ManagerLayout.tsx`

---

## Environment setup

Copy `backend/.env.example` to `backend/.env`. Required variables for local dev:
- `DATABASE_URL` — defaults match the docker-compose Postgres container
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — any long random strings locally
- `ENCRYPTION_KEY` — 64 hex chars (32 bytes); the example uses all-zeros which is fine for dev

Third-party integrations (Stripe, SendGrid, Twilio, S3) are optional for local dev — the services that call them are not yet wired to live keys.
