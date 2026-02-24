# CSIS 4495 Midterm Progress Report

**Project Title:** Optimizing Emergency Department Throughput via Remote Digital Triage and Synchronous Telemedicine Interventions  

**Team Members:** Bright Ekeator (300318200), AJ Encina (300381971)  
**Course:** CSIS 4495-003  

---

## 1. Project Summary and Objectives (from Proposal)

The project aims to design and evaluate a web-based remote emergency room triage and telemedicine system that:

1. Enables **remote triage** so patients can submit symptom information before arriving at the ED.
2. Provides **automated ESI-like triage levels (1–5)** based on chief complaint, symptoms, and self-reported urgency.
3. Supports **human-in-the-loop** nurse oversight with review, override, and completion of cases.
4. Maintains an **audit trail** for accountability and research.

Research objectives from the proposal:

- **I.** Design and implement a web-based remote triage prototype (symptom intake, automated prioritization, nurse override).
- **II.** Simulate ED workflows with and without remote triage to evaluate impact on patient flow and waiting times.
- **III.** Assess effectiveness of human-in-the-loop oversight on reliability and acceptability of automated triage.
- **IV.** Analyze operational benefits (e.g., waiting room congestion, simulated LWBS rates).

---

## 2. Progress Relative to Proposed Timeline

The proposal outlined four phases over twelve weeks:

| Phase | Proposed scope | Status |
|-------|----------------|--------|
| **Phase 1: Research and Planning (Weeks 1–2)** | Literature review, problem definition, proposal | **Completed** (proposal submitted) |
| **Phase 2: System Design (Weeks 3–4)** | Architecture, data flow, wireframes, security design | **Completed** (reflected in current architecture and schema) |
| **Phase 3: System Development (Weeks 5–9)** | Patient interface, nurse dashboard, video consultation, DB, auth, RBAC | **In progress** (core features implemented; video is placeholder) |
| **Phase 4: Testing and Evaluation (Weeks 10–12)** | Scenario-based simulation, data analysis, final report | **Not started** |

Midterm progress is on track: Phases 1–2 are done, and Phase 3 development is well underway.

---

## 3. Completed Deliverables

### 3.1 System Architecture and Stack

- **Frontend:** React 18, Vite, React Router. Responsive UI for home, staff login/register, new triage, nurse dashboard, nurse case view, and audit log.
- **Backend:** Node.js, Express. RESTful API with routes for auth, triage submission, patient cases, and audit.
- **Database:** PostgreSQL. Schema includes `users` (patient, nurse, doctor roles), `triage_cases` (demographics, chief complaint, symptoms, self-reported urgency, automated and final triage levels, override fields, status, timestamps), and `audit_log` (user, action, resource, details, timestamps).
- **Security:** JWT authentication, role-based access control (RBAC), and audit logging for key actions.

### 3.2 Implemented Features

**Patient-facing**

- **Remote triage submission:** “New triage” flow for demographics, chief complaint, self-reported urgency (1–5), and symptom selection. Supports both **guest submission** (no account) and **authenticated submission** (registered patient).
- **Automated triage:** Server-side logic assigns an ESI-like level (1–5) from urgency, selected symptoms, and chief-complaint keywords (e.g., chest pain, breathing, unconscious, bleeding, stroke). Level 1 = most urgent, 5 = least urgent.

**Nurse-facing**

- **Queue:** Nurses see a list of submitted cases (e.g., by status) and can open individual cases.
- **Case review:** View full patient demographics, chief complaint, symptoms, and automated triage level.
- **Override:** Nurse can change the triage level and provide an optional reason; action is logged.
- **Complete:** Nurse can “Accept automated level & complete” or “Confirm override & complete”; status moves to completed and timestamps (e.g., first_reviewed_at, completed_at) are set.
- **Audit log:** Nurses can view an audit log of actions (e.g., overrides, completions) for accountability.

**Authentication and roles**

- **Registration and login:** Email/password with hashed passwords (bcrypt). JWT issued on login.
- **Roles:** Patient, Nurse, Doctor (database and API support all three; nurse and doctor dashboards are implemented; doctor flow can be used for future extensions).
- **Protected routes:** Frontend and API enforce role-based access (e.g., queue and override only for nurses).

**Audit and data**

- **Audit trail:** Key actions (e.g., override, complete) are recorded in `audit_log` with user, action, resource, and timestamp. Supports accountability and later analysis.
- **Timestamps:** `submitted_at`, `first_reviewed_at`, `completed_at` on triage cases support future metrics (e.g., time to triage, queue length).

### 3.3 Additional Backend Capabilities

- **OTP API:** Routes for send/verify OTP are present (e.g., for future two-factor or verification flows).
- **Health check:** `/api/health` for deployment/monitoring.
- **Database init script:** `npm run db:init` creates schema and tables for consistent setup.

---

## 4. Partially Completed / Placeholder Items

- **Video consultation:** The proposal specified WebRTC for secure real-time video between patients and nursing staff. The nurse case page includes a **video consultation section as a placeholder**. Integration options documented in the README (e.g., WebRTC library or third-party service such as Jitsi or Daily.co).
- **Doctor role:** Database and routes support a doctor role and doctor dashboard/case pages; these can be used for future telemedicine or escalation workflows.
- **Simulation and evaluation:** Scenario-based simulation, performance metrics (e.g., wait times, LWBS), and qualitative evaluation are planned for Phase 4 and have not yet been started.

---

## 5. Alignment with Proposal Objectives and Methodology

- **Objective I (prototype with symptom intake, automated prioritization, nurse override):** **Met.** Remote triage form, automated ESI-like level, nurse queue, review, override, and complete are implemented and logged.
- **Objective II (simulate ED workflows):** **Planned for Phase 4.** Data model and timestamps are in place to support simulation and comparison of workflows.
- **Objective III (human-in-the-loop effectiveness):** **Partially addressed.** Override and audit are in place; formal evaluation is planned for Phase 4.
- **Objective IV (operational benefits):** **Planned for Phase 4.** Simulation and analysis of congestion and LWBS will use the current schema and logs.

The development approach matches the proposal: web-based prototype, human-in-the-loop nurse oversight, RBAC, secure authentication, and audit trails. The system is suitable for academic use with synthetic data only (no real patient data).

---

## 6. Challenges and Mitigations

- **Scope of roles:** Proposal emphasized patient and nurse; the implementation also includes a doctor role and doctor UI. This extends the prototype without conflicting with the core objectives and allows future telemedicine or escalation scenarios.
- **Video consultation:** WebRTC integration was deferred to keep midterm focus on triage and override workflow. Placeholder and README guidance allow integration in the remaining weeks.
- **Simulation and metrics:** No delays anticipated; Phase 4 will use existing timestamps and audit data for scenario-based simulation and analysis.

---

## 7. Next Steps (Remaining Phase 3 and Phase 4)

1. **Phase 3 (remaining):**
   - Optional: Implement WebRTC (or third-party) video consultation on the nurse case page.
   - Optional: Enhance doctor workflow if needed for telemedicine or escalation.
   - Finalize any UI/UX improvements and ensure all proposal-specified triage and override flows are documented and stable.

2. **Phase 4 (Testing and Evaluation):**
   - Build or use synthetic patient cases (e.g., ~150 cases as in the proposal) covering low-, moderate-, and high-acuity presentations.
   - Run scenario-based simulations: baseline (in-person-only triage) vs. experimental (remote triage before arrival).
   - Collect and analyze metrics: time to triage, queue length, waiting times for high-acuity cases, simulated LWBS rates.
   - Conduct qualitative evaluation (e.g., questionnaires/interviews) with participants in clinical roles on usability and trust in the override mechanism.
   - Complete final project report and presentation materials.

---

## 8. Conclusion

Midterm progress is **on track**. Research and planning (Phase 1) and system design (Phase 2) are complete. Phase 3 development has delivered the core prototype: remote symptom intake, automated ESI-like triage, nurse queue, review, override, completion, and audit logging, with JWT, RBAC, and PostgreSQL in place. Video consultation remains a placeholder for later integration. The next focus is completing any remaining Phase 3 items and then executing Phase 4 scenario-based simulation and evaluation to meet the proposal’s research objectives and expected outcomes.

---

*This report can be copied into the course midterm report template (e.g., 4495_MidtermReport_Template) and adjusted to match any required section headings or word limits.*
