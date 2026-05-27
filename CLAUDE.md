# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

```
property-management/
├── backend/    Node.js + Express + Prisma API (port 4000)
├── frontend/   React + Vite + Tailwind UI (port 3000)
├── e2e/        Playwright tests (all 4 portals)
└── docker-compose.yml  (postgres + pgAdmin — only needed if not using local PG)
```

Node is installed at `C:\Program Files\nodejs\` and is **not** on the default shell PATH. Every `npm`/`node`/`npx` command needs:
```powershell
$env:PATH = "C:\Users\sam\AppData\Roaming\npm;C:\Program Files\nodejs;" + $env:PATH
```

`claude.cmd` is at `C:\Users\sam\AppData\Roaming\npm\claude.cmd`. To reopen Claude Code from this project, run `open-propflow.bat` from the Desktop (it sets PATH and cds here automatically).

---

## Database

**Local PostgreSQL 16** is installed and running (`postgresql-x64-16` service). Docker is not required.

Credentials: `postgres:postgres` · database: `property_management` · port `5432`

```powershell
# Backend (cd backend first)
npm run db:seed      # creates 4 test accounts + Acme Property Management company
npm run db:deploy    # apply migrations (non-interactive, use in CI)
npm run db:migrate   # create + apply a migration interactively (real terminal only)
npm run db:generate  # regenerate Prisma client after schema.prisma changes
npm run db:studio    # Prisma Studio GUI on :5555
```

**Schema drift fix** — if `db:deploy` says "no pending migrations" but Prisma throws `column does not exist` at runtime, the schema was edited without creating a migration. Fix with:
```powershell
npx prisma db push   # syncs schema.prisma → DB without creating a migration file
```

**Schema change workflow:** edit `prisma/schema.prisma` → `npm run db:migrate` (creates migration + applies it) → restart dev server. Use `db:generate` only when regenerating the client without schema changes.

---

## Commands

### Backend (`cd backend`)
```powershell
npm run dev            # ts-node-dev hot reload on :4000
npm run build          # prisma generate + tsc → dist/
npm run test           # vitest run (all unit tests)
npm run test:coverage  # vitest with v8 coverage
npx vitest run src/tests/accounting.test.ts  # single test file
npx tsc --noEmit       # type-check only (no typecheck script — use build to compile)
```

### Frontend (`cd frontend`)
```powershell
npm run dev         # Vite dev server on :3000 (requires PATH set per above)
npm run typecheck   # tsc --noEmit — always run before committing
npm run build       # production build → dist/
```
If `npm` isn't found, invoke Vite directly: `"C:\Program Files\nodejs\node.exe" node_modules\vite\bin\vite.js --port 3000 --host`

Vite proxies `/api/*` → `http://localhost:4000` in dev (no CORS config needed).

### E2E (`cd e2e`)
```powershell
npx playwright install chromium   # first-time only
npm run test:e2e          # headless
npm run test:e2e:headed   # with browser visible
npm run test:e2e:ui       # Playwright UI mode
npm run test:e2e:report   # open last HTML report
```

E2E prerequisites: backend on :4000, frontend on :3000, `db:seed` run. Auth sessions cached per role in `e2e/.auth/{role}.json` (gitignored). Setup files in `e2e/setup/` run once to create those sessions; specs in `e2e/tests/` use them via `storageState`.

---

## Seeded test data

`npm run db:seed` creates:

| Role | Email | Password |
|------|-------|----------|
| Manager | `manager@example.com` | `password123` |
| Owner (Bob) | `owner@example.com` | `password123` |
| Tenant (Carol) | `tenant@example.com` | `password123` |
| Vendor (Dave) | `vendor@example.com` | `password123` |

Company: **Acme Property Management** · Property: **Maple Street Apartments** · 3 units · 1 active lease (Carol in unit 2A) · 1 vendor (Dave)

---

## Backend architecture

### Request lifecycle
`authenticate` → `requireRole` → controller (Zod validation) → service (business logic) → Prisma → response helper

Controllers are thin. All logic lives in `*.service.ts`.

### Response envelope
All responses use helpers from `src/lib/response.ts`:
```ts
ok(res, data)          // { success: true, data }
created(res, data)     // 201
paginate(res, data, total, page, limit)
notFound(res)
badRequest(res, msg)
```

### Key lib files
| File | Purpose |
|------|---------|
| `src/lib/crypto.ts` | AES-256-GCM PII encryption. Use `encryptIfPresent` / `decryptIfPresent` on Owner.taxId, bankAccountNumber, bankRoutingNumber |
| `src/lib/s3.ts` | Presigned URLs. Falls back to `http://localhost:4000/dev-uploads/{key}` when `AWS_ACCESS_KEY_ID` is absent |
| `src/lib/email.ts` | SendGrid. **Silent no-op when `SENDGRID_API_KEY` unset** |
| `src/lib/sms.ts` | Twilio. **Silent no-op when `TWILIO_*` unset** |
| `src/lib/stripe.ts` | `getStripe()` throws if key missing; guard with `stripeConfigured()` |
| `src/lib/checkr.ts` | `checkrConfigured()` guard; `createCandidate()`, `createInvitation()`, `verifyCheckrSignature()` |
| `src/middleware/auth.middleware.ts` | Attaches `req.user: { sub, role, managementCompanyId, email }` |
| `src/middleware/rbac.middleware.ts` | `requireManager`, `requireOwner`, `requireTenant`, `requireVendor`, `requireManagerOrOwner` |

### API routes
All under `/api/v1/`. Mounted in `src/api/v1/index.ts`.

| Prefix | Notes |
|--------|-------|
| `/auth` | `POST /login`, `POST /register/manager`, `GET /me`, `PATCH /me`, `POST /refresh`, `POST /forgot-password`, `POST /reset-password`, `POST /change-password`. Rate-limited: 20 req/15 min |
| `/properties` | `requireManagerOrOwner` for reads |
| `/properties/:propertyId/units` | Nested router, `mergeParams: true` |
| `/leases` | **Route order matters**: `/expiring`, `/tenants`, `/my-lease` registered before `/:id`. `GET /my-lease` (tenant) returns `{ tenant, lease }` — not a flat lease object. `POST /:id/activate`, `POST /:id/terminate`, `POST /:id/renew` |
| `/tenants` | All `requireManager`. `POST /` creates User + Tenant + fires invite email |
| `/accounting` | `GET /ledger/:leaseId/tenant` accessible to tenants. `GET /owner-statement/:userId` — takes the **User.id** (JWT `sub`), not the Owner record id |
| `/maintenance` | Work orders + invoices. `POST /invoices/:id/approve` posts JE + closes WO. `PATCH /work-orders/:id/vendor-action` for vendor role only |
| `/reports` | `requireManagerOrOwner`. `?startDate=&endDate=` on rent-roll/vacancy/work-orders. Delinquency is always current-state snapshot |
| `/documents` | `POST /upload-url` (S3 presigned), `GET /`, `GET /:id/download-url`, `DELETE /:id` |
| `/messages` | `GET /inbox`, `GET /sent`, `GET /unread-count`, `GET /recipients`, `POST /` (1-to-1), `POST /broadcast` (manager only, max 500 recipients), `PATCH /:id/read`, `PATCH /mark-all-read` |
| `/applications` | `POST /` and `GET /unit/:unitId` are **public**. `POST /:id/submit-for-screening` → Checkr |
| `/payments` | Stripe setup-intent, payment-intent, confirm. `GET /autopay-status`, `PATCH /autopay`. All require tenant auth |
| `/owners` | `GET /me`, `PATCH /me/bank`, `POST /me/disbursement-request`, `GET /disbursements`, `POST /disbursements` (manager — posts OWNER_DISBURSEMENT JE) |
| `/listings` | `GET /` and `GET /unit/:unitId` are **public**. Manager: `PATCH /properties/:pId/units/:uId` (toggle `listingEnabled` + description) |
| `/leases/:leaseId/inspections` | Manager: create inspection (JSON room checklist). Both roles: list/get. Tenant: `POST /:id/sign` |
| `/leases/:leaseId/recurring-charges` | CRUD for non-rent recurring charges (parking, pet fees, utilities). Posted daily by `recurringCharges.job.ts` |
| `/leases/:id/pdf` | `GET` — streams PDF via pdfkit. Manager or tenant role. Uses `apiDownloadBlob()` on the frontend |
| `/webhooks/stripe` | Registered **before** `express.json()` in `src/index.ts` |
| `/webhooks/checkr` | Registered **before** `express.json()`. HMAC-SHA256 verify, handles `report.completed` |

**Global rate limit:** 300 req/min per IP (skipped when `NODE_ENV=test`).

### Multi-tenancy rule
Every Prisma query touching tenant data **must** include `managementCompanyId` in `where`. Comes from `req.user.managementCompanyId`. Missing it causes cross-tenant data leakage.

### Adding a new module
1. Create `src/api/v1/<module>/` with `.service.ts`, `.controller.ts`, `.routes.ts`
2. Register in `src/api/v1/index.ts`
3. Use `authenticate` + `requireRole` on every route; use response helpers

---

## Accounting engine — hard invariants

- **Cents only.** `$12.50` → `1250`. Never floats anywhere in the stack.
- **Journal entries are immutable.** Never UPDATE/DELETE a posted `JournalEntry`. Corrections need a reversal entry (`isReversed = true`, `reversedById` on original).
- **Every financial mutation posts a balanced JE** (debits = credits) inside `prisma.$transaction`. See `accounting.service.ts` for the pattern.
- **Trust accounts never commingled:** deposits → `1020`, rent receipts → `1010`. Never post tenant money to `1000` (Operating).
- **FIFO payment application:** `recordPayment` applies to `RentCharge` rows ordered `dueDate ASC`. Do not change this.
- Chart of accounts seeded in `auth.service.ts → seedChartOfAccounts()` on company creation.

### Key account codes
| Code | Account | Type |
|------|---------|------|
| 1000 | Operating Account | ASSET |
| 1010 | Trust - Rent | ASSET |
| 1020 | Trust - Security Deposits | ASSET |
| 1100 | Accounts Receivable | ASSET |
| 2000 | Accounts Payable | LIABILITY |
| 2100 | Security Deposit Liability | LIABILITY |
| 2200 | Owner Funds Payable | LIABILITY |
| 4000 | Rental Income | INCOME |
| 4100 | Late Fee Income | INCOME |
| 5000 | Maintenance Expense | EXPENSE |

### Journal entry patterns
| Event | Debit | Credit |
|-------|-------|--------|
| Security deposit received | 1020 | 2100 |
| Security deposit returned | 2100 | 1020 |
| Invoice approved | 5000 | 2000 |
| Owner disbursement | 2200 | 1000 |

---

## Background jobs

Live in `backend/src/jobs/`, started via `startAllJobs()` in `src/index.ts` after DB connects. All idempotent.

| Job | Schedule | What it does |
|-----|----------|-------------|
| `rentPosting.job.ts` | 00:05 daily | `postMonthlyRentCharges()` for every company |
| `recurringCharges.job.ts` | 00:10 daily | `postRecurringCharges()` — parking, pet fees, utilities, etc. |
| `lateFee.job.ts` | 01:00 daily | `postLateFees()` for every company |
| `autopay.job.ts` | 08:00 daily | Stripe off-session charge for tenants with `autopayEnabled=true` |
| `leaseExpiry.job.ts` | 09:00 daily | SMS tenants whose lease expires in 6–8 days |

Trigger rent/late-fee manually: `POST /api/v1/accounting/rent-charges/post` or `/late-fees/post` (manager).

---

## Database schema — key relationships & gotchas

```
ManagementCompany
  ├── User (role: MANAGER | OWNER | TENANT | VENDOR)
  │     └── passwordResetToken / passwordResetExpiresAt (1-hour expiry)
  ├── Owner → Property[] → Unit[] → Lease → Tenant[]
  │                                       → RentCharge[] (scheduler)
  │                                       → Payment[] → PaymentApplication[] (FIFO)
  │                                       → Document[]
  ├── WorkOrder → Vendor → Invoice → InvoiceLineItem
  ├── Disbursement (status: PENDING/PROCESSED/FAILED, journalEntryId)
  ├── Account (Chart of Accounts)
  ├── JournalEntry → JournalLine[] (immutable)
  ├── Message (senderId/recipientId → User, channel: IN_APP)
  └── RentalApplication (status: RECEIVED|SCREENING|APPROVED|DENIED)
```

- Soft-delete everywhere: always filter `WHERE deletedAt IS NULL`
- `Unit.status` flips `OCCUPIED` ↔ `VACANT` on lease activate/terminate automatically
- Work order machine: `SUBMITTED → APPROVED → ASSIGNED → IN_PROGRESS → COMPLETED → INVOICED → CLOSED` (or `DENIED`). Enforced in `maintenance.service.ts → validateStatusTransition`
- `Tenant` has **denormalized** `firstName`, `lastName`, `email`, `phone` columns in addition to the `User` relation — both must be set on create
- `Tenant.lease` is a to-one (leaseId FK on Tenant), not an array
- `Owner` PII (`taxId`, `bankAccountNumber`, `bankRoutingNumber`) is AES-256-GCM encrypted — always use `encryptIfPresent` / `decryptIfPresent`
- `Lease` termination accepts `moveOutDate` + `depositReturnAmount`; posts `SECURITY_DEPOSIT_RETURN` JE if amount > 0
- `Lease` renewal (`POST /:id/renew`): extends `endDate`, optionally updates `rentAmount`, reverts `MONTH_TO_MONTH` → `ACTIVE`

---

## Frontend architecture

### Portals
Four isolated portals, each with its own layout and color theme:

| Portal | Prefix | Layout | Theme |
|--------|--------|--------|-------|
| Manager | `/manager/*` | `ManagerLayout.tsx` | Indigo sidebar |
| Tenant | `/tenant/*` | `TenantLayout.tsx` | Teal, mobile bottom-nav |
| Owner | `/owner/*` | `OwnerLayout.tsx` | Green top-nav |
| Vendor | `/vendor/*` | `VendorLayout.tsx` | Amber top-nav |

`ProtectedRoute` wraps each portal — redirects to that portal's login if JWT role doesn't match.

Public routes (no auth): `/`, `/apply/:unitId`, `/forgot-password`, `/reset-password?token=`

### State & data fetching
- Auth: Zustand (`src/store/auth.store.ts`), persisted to `localStorage` key `pm-auth`
- Server state: **React Query v5**. `onSuccess` was removed in v5 — use `useEffect(() => { if (data) {...} }, [data])` instead
- HTTP: Axios in `src/lib/api.ts` (base `/api/v1`). Auto-refreshes on 401, calls `logout()` if refresh fails
- Typed helpers unwrap `{ success, data }`: `apiGet<T>`, `apiPost<T>`, `apiPatch<T>`, `apiDelete`

### UI conventions
- Money: `formatCents(cents)` from `src/lib/utils.ts` — never divide by 100 inline
- Status badges: `<StatusBadge status="ACTIVE" />` — handles unit/lease/work-order/payment/application/invoice
- Cards: `<Card>`, `<CardHeader>`, `<CardBody>`, `<StatCard label="" value="" icon={} color="indigo" />`
- Table: `<Table data={rows} columns={[{ key, header, render }]} onRowClick={fn} />` — no raw `<thead>/<tr>` children
- Loading: `<Skeleton className="h-N" />`
- `Card` has no `onClick` prop — wrap in `<div onClick={...}>`
- Adding a manager page: create file → add `<Route>` in `App.tsx` → add nav entry in `ManagerLayout.tsx`

### API response normalization
Backend returns either a plain array or `{ data: T[], total: number }`. Always normalize:
```ts
const items = Array.isArray(raw) ? raw : (raw as { data: T[] })?.data ?? [];
```

### Known response shapes
- `GET /leases/my-lease` → `{ tenant: { ...tenantFields, lease: {...} }, lease: {...} }` — lease is nested, not top-level
- `GET /accounting/owner-statement/:userId` — `:userId` is the **User.id** (`req.user.sub`), not the Owner record id (see `OwnerStatements.tsx`: `user?.sub`)

### Local auth bypass (browser devtools)
```ts
const h = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const p = btoa(JSON.stringify({ sub: 'id', role: 'MANAGER', managementCompanyId: 'co-id', email: 'manager@example.com', exp: Math.floor(Date.now()/1000) + 86400 }));
localStorage.setItem('pm-auth', JSON.stringify({ state: { accessToken: `${h}.${p}.sig`, user: { sub: 'id', role: 'MANAGER', managementCompanyId: 'co-id', email: 'manager@example.com' } } }));
```

---

## Testing

### Unit tests (Vitest)
Live in `backend/src/tests/`. Mock pattern — required because `vi.mock` is hoisted:
```ts
const mockPrisma = vi.hoisted(() => ({ user: { findFirst: vi.fn(), ... }, $transaction: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: mockPrisma }));
// $transaction mock:
mockPrisma.$transaction.mockImplementation((fn) => fn(mockPrisma));
```

### E2E tests (Playwright)
`e2e/setup/{role}.setup.ts` — logs in once, saves `storageState` to `.auth/{role}.json`
`e2e/tests/{manager,tenant,owner,vendor}.spec.ts` — each project picks up the cached session

---

## Environment

`backend/.env` required vars:
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/property_management`
- `JWT_SECRET` / `JWT_REFRESH_SECRET` — any long strings
- `ENCRYPTION_KEY` — 64 hex chars (all-zeros OK for dev)

Optional (all gracefully no-op when absent):
- S3: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- SendGrid: `SENDGRID_API_KEY`, `EMAIL_FROM`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- Checkr: `CHECKR_API_KEY`, `CHECKR_WEBHOOK_SECRET`, `CHECKR_PACKAGE` (default `checkr_basic`)
- Frontend: `VITE_STRIPE_PUBLISHABLE_KEY` in `frontend/.env`

## Production deployment

| Layer | Platform | Key env var |
|-------|----------|-------------|
| Frontend | Vercel | `VITE_API_URL` = Railway backend URL |
| Backend | Railway | `FRONTEND_URL` (CORS), `NODE_ENV=production` |
| Database | Neon | `DATABASE_URL` |

After first deploy: `railway run npm run db:deploy`

CI (`.github/workflows/ci.yml`): `backend` (test + typecheck) → `frontend` (typecheck) → `e2e` (Playwright) → `docker` (image build) → `deploy` (main branch only, all must pass).
