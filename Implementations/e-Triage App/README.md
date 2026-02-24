##  e-Triage – Run Instructions

This is a full‑stack web app for remote emergency department triage and nurse oversight, built with **React + Vite**, **Node/Express**, and **PostgreSQL**.

### 1. Prerequisites

- **Node.js**: v18+ (LTS recommended)
- **npm**: comes with Node
- **PostgreSQL**: local instance or a managed service (e.g., Supabase)

### 2. Clone and install dependencies

```bash
git clone <your-repo-url>
cd e-Triage
npm install
```

All frontend and backend dependencies are managed from the root `package.json`.

### 3. Configure environment variables

1. In the project root, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Open `.env` and update the values:

- **PORT**: API server port (default `3001`).
- **DATABASE_URL**: PostgreSQL connection string.
  - For local DB, something like: `postgresql://localhost:5432/bright_triage`
  - For Supabase/managed DB, use the provided pooler URL as documented in the example.
- **JWT_SECRET**: replace with a long, random string for signing JWTs.
- **CLIENT_ORIGIN** (optional): frontend origin for CORS (defaults to `http://localhost:5173` in development).

> **Note:** Do **not** commit your `.env` file to version control.

### 4. Initialize the database

Make sure your PostgreSQL instance is running and the `DATABASE_URL` in `.env` is correct, then run:

```bash
npm run db:init
```

This will create the required schema and tables for users, triage cases, and audit logs.

### 5. Run the app in development

From the project root:

```bash
npm run dev
```

This command:

- Starts the **API server** on `http://localhost:3001` (or the `PORT` you set in `.env`).
- Starts the **React/Vite client** on `http://localhost:5173`.
- Configures a dev proxy so frontend calls to `/api/...` are forwarded to the backend.

Open the browser at:

- **Frontend**: `http://localhost:5173`
- **Health check**: `http://localhost:3001/api/health`

If port `3001` is already in use, stop the other process or change `PORT` in `.env` (e.g., `PORT=3002`).

### 6. Running frontend and backend separately (optional)

You can also start the services individually:

- **Backend (Express API)**:

  ```bash
  npm run server
  ```

- **Frontend (Vite dev server)**:

  ```bash
  npm run client
  ```

When running separately, make sure `PORT` and `CLIENT_ORIGIN` are set so that:

- Backend serves at `http://localhost:<PORT>`
- Frontend runs at `http://localhost:5173`

### 7. Build and preview production bundle

To build the optimized frontend bundle:

```bash
npm run build
```

To preview the built app with Vite’s preview server:

```bash
npm run preview
```

> **Note:** In production you will typically host the frontend with a static host and run the Express server separately, pointing it at the same database and environment variables.

### 8. Project scripts (summary)

From `package.json`:

- **`npm run dev`**: run backend and frontend together (development)
- **`npm run server`**: run only the Express API server
- **`npm run client`**: run only the React/Vite client
- **`npm run build`**: build frontend for production
- **`npm run preview`**: preview the built frontend
- **`npm run db:init`**: initialize PostgreSQL schema

# Bright – Remote ED Triage & Telemedicine

**Optimizing Emergency Department Throughput via Remote Digital Triage and Synchronous Telemedicine Interventions**

CSIS 4495-003 · Bright Ekeator (300318200) & AJ Encina

---

## Overview

This web application is an academic research prototype for:

- **Remote triage**: Patients submit symptom information and self-reported urgency before arriving at the ED.
- **Automated triage**: The system assigns a preliminary ESI-like level (1–5) based on chief complaint, symptoms, and urgency.
- **Human-in-the-loop**: Nurses review cases, override triage levels when needed, and complete assessments.
- **Audit trail**: All actions are logged for accountability and research.

## Tech Stack

- **Frontend**: React 18, Vite, React Router
- **Backend**: Node.js, Express
- **Database**: PostgreSQL
- **Auth**: JWT, role-based access (patient / nurse)
- **Security**: RBAC, audit logging (video consultation is placeholder for WebRTC integration)

## Prerequisites

- Node.js 18+
- PostgreSQL 14+

## Setup

1. **Clone and install**

   ```bash
   cd Bright
   npm install
   ```

2. **Database**

   Create a PostgreSQL database and set the connection URL:

   ```bash
   createdb bright_triage
   cp .env.example .env
   # Edit .env and set DATABASE_URL and JWT_SECRET
   npm run db:init
   ```

3. **Run**

   ```bash
   npm run dev
   ```

   - Frontend: http://localhost:5173  
   - API: http://localhost:3001  

## Usage

- **Patients**: Register (role: Patient) → **New triage** → Fill demographics, chief complaint, urgency, symptoms → Submit. View **My cases** for history.
- **Nurses**: Register (role: Nurse) → **Queue** → Open a case → Override triage level (optional) and **Confirm override & complete** or **Accept automated level & complete**. **Audit log** shows all actions.

## Project Structure

```
Bright/
├── server/           # Express API
│   ├── db/           # PostgreSQL pool, schema, init, audit
│   ├── lib/          # Triage logic (ESI-like)
│   ├── middleware/   # JWT auth, RBAC
│   └── routes/       # auth, triage, patients, audit
├── src/              # React app
│   ├── context/      # AuthContext
│   ├── components/   # Layout
│   └── pages/        # Home, Login, Register, Patient flow, Nurse flow, Audit
├── package.json
├── vite.config.js
└── README.md
```

## Video Consultation

The **Video consultation** section on the nurse case page is a placeholder. The proposal specifies WebRTC for secure real-time video between patients and nursing staff. Integration options:

- Use a WebRTC library (e.g. simple-peer, or browser `getUserMedia` + signaling server).
- Or integrate a compliant third-party service (e.g. Jitsi, Daily.co) and link from the case page.

## License

Academic use only. No real patient data.
