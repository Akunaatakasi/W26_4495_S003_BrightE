# Installation Guide - e-Triage

This guide explains how to set up and run the project locally.

---

## 1) Prerequisites

Install the following first:

- **Node.js** 18+ (LTS recommended)
- **npm** (comes with Node.js)
- **PostgreSQL** 14+ (local or managed, e.g., Supabase pooler URL)
- (Optional) **Python** 3.10+ for ML prediction service

Quick checks:

```bash
node -v
npm -v
psql --version
python --version
```

---

## 2) Get the project and install packages

From the project root:

```bash
npm install
```

This installs both frontend and backend dependencies from the root `package.json`.

---

## 3) Configure environment variables

Create `.env` from `.env.example`:

### macOS/Linux
```bash
cp .env.example .env
```

### Windows PowerShell
```powershell
Copy-Item .env.example .env
```

Open `.env` and set at minimum:

- `PORT` (default: `3001`)
- `DATABASE_URL` (PostgreSQL connection string)
- `JWT_SECRET` (long random secret)

### Recommended `DATABASE_URL` format

- Local PostgreSQL:
  - `postgresql://localhost:5432/bright_triage`
- Supabase (pooler URL / port 6543):
  - `postgresql://postgres.[ref]:YOUR_PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres`

---

## 4) Initialize database schema

Run:

```bash
npm run db:init
```

This executes `server/db/init.js` and applies `server/db/schema.sql`.

---

## 5) Run the app (development)

Run frontend + backend together:

```bash
npm run dev
```

Default URLs:

- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3001`
- Health check: `http://localhost:3001/api/health`

---

## 6) Run services separately (optional)

Backend only:

```bash
npm run server
```

Frontend only:

```bash
npm run client
```

---

## 7) Build for production

```bash
npm run build
npm run preview
```

---

## 8) Optional: Enable OTP email delivery

If SMTP is not configured, OTP codes are not emailed (dev fallback logs behavior). To send real emails, set SMTP values in `.env`:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- (optional) `SMTP_FROM_NAME`

`OTP_DEBUG_LOG=true` is for local debugging only; do not use in production.

---

## 9) Optional: Run ML prediction API

The backend can call a local Flask API at `http://127.0.0.1:5000/predict`.

### 9.1 Install Python deps

```bash
pip install -r analytics/ml/requirements.txt
```

### 9.2 Start ML service

From `analytics/ml`:

```bash
python predict_api.py
```

If ML service is not running, backend falls back to internal rule-based triage.

---

## 10) Useful troubleshooting

### Port already in use

- Change `PORT` in `.env` (backend)
- Keep frontend on `5173` or restart Vite

### Database connection timeout

- Verify `DATABASE_URL`
- For Supabase, use **pooler URL** (`6543`), not direct IPv6 host/5432

### `npm run db:init` fails

- Confirm PostgreSQL is reachable
- Confirm credentials in `DATABASE_URL`
- Re-run after fixing `.env`

### OTP send errors

- Verify SMTP credentials
- For SendGrid, ensure sender/domain is verified
- Confirm `SMTP_FROM` matches a verified sender

---

## 11) First run checklist

- [ ] `npm install` completed
- [ ] `.env` created from `.env.example`
- [ ] `DATABASE_URL` and `JWT_SECRET` set
- [ ] `npm run db:init` succeeded
- [ ] `npm run dev` running without errors
- [ ] `http://localhost:3001/api/health` returns OK
- [ ] Can open `http://localhost:5173`

---

## 12) Project scripts reference

From root `package.json`:

- `npm run dev` - run backend + frontend
- `npm run server` - backend only
- `npm run client` - frontend only
- `npm run db:init` - initialize DB schema
- `npm run build` - production build
- `npm run preview` - preview production build
