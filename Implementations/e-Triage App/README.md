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
