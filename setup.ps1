# PropFlow Setup Script (Windows PowerShell)
# Run from the property-management/ directory

Write-Host "🏗  PropFlow Setup" -ForegroundColor Cyan

# 1. Start Postgres
Write-Host "`n▶ Starting PostgreSQL via Docker..." -ForegroundColor Yellow
docker compose up -d postgres
Start-Sleep -Seconds 3

# 2. Install backend deps
Write-Host "`n▶ Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install

# 3. Copy .env
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host "✅ Created backend/.env from example — edit it if needed" -ForegroundColor Green
}

# 4. Generate Prisma client + migrate
Write-Host "`n▶ Running Prisma migrate..." -ForegroundColor Yellow
npx prisma migrate dev --name init

# 5. Seed database
Write-Host "`n▶ Seeding database..." -ForegroundColor Yellow
npm run db:seed

# 6. Install frontend deps
Write-Host "`n▶ Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location ../frontend
npm install

Set-Location ..

Write-Host "`n✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To start development servers:" -ForegroundColor Cyan
Write-Host "  Terminal 1 (API):      cd backend  && npm run dev"
Write-Host "  Terminal 2 (Frontend): cd frontend && npm run dev"
Write-Host ""
Write-Host "Login credentials (from seed):" -ForegroundColor Cyan
Write-Host "  Manager: manager@example.com / password123  → http://localhost:3000/manager/login"
Write-Host "  Owner:   owner@example.com   / password123  → http://localhost:3000/owner/login"
Write-Host "  Tenant:  tenant@example.com  / password123  → http://localhost:3000/tenant/login"
Write-Host "  Vendor:  vendor@example.com  / password123  → http://localhost:3000/vendor/login"
