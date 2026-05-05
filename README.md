# APEX - AI Personal Finance Manager

Full-stack personal finance manager with Oracle XE 11.2 data warehouse, Express APIs, and a React slide-deck dashboard.

## Stack
- Frontend: React + Vite + Tailwind + Recharts + hls.js + motion
- Backend: Node.js + Express + Supabase + Groq LLM
- DB: Supabase Postgres Star Schema + analytics SQL

## Quick Start

### 1) Backend setup
```powershell
cd "D:\DATA WARE HOUSE\apex-finance\backend"
npm install
Copy-Item .env.example .env
```

Edit `.env`:
- `SUPABASE_URL=https://<project-ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `GROQ_API_KEY=...`

Run backend:
```powershell
npm run dev
```

### 2) Frontend setup
```powershell
cd "D:\DATA WARE HOUSE\apex-finance\frontend"
npm install
npm run dev
```

### 3) Supabase warehouse schema
Run this in Supabase SQL Editor:
`D:\DATA WARE HOUSE\apex-finance\sql\supabase_dw.sql`

### 4) Generate CSV dataset (10,000 transactions)
```powershell
cd "D:\DATA WARE HOUSE\apex-finance\backend"
npm run generate:data
```

Generated files:
- `backend/data/dim_date.csv`
- `backend/data/dim_category.csv`
- `backend/data/dim_account.csv`
- `backend/data/fact_budget.csv`
- `backend/data/fact_transactions.csv`

### 5) Load CSVs to Supabase
Use Supabase Table Editor import for each table in this order:
1. `dim_date.csv` -> `dim_date`
2. `dim_category.csv` -> `dim_category`
3. `dim_account.csv` -> `dim_account`
4. `fact_budget.csv` -> `fact_budget`
5. `fact_transactions.csv` -> `fact_transactions`

## API Endpoints
- `GET /transactions`
- `GET /analytics/monthly`
- `GET /analytics/category`
- `POST /ai-query`
