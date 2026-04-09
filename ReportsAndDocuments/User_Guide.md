# User Guide - e-Triage

This guide explains how clients/end-users use e-Triage.

---

## 1) What e-Triage does

e-Triage allows patients to submit emergency triage information remotely, then lets clinical staff (nurse/doctor) review, prioritize, and complete cases.

Main user roles:

- **Patient/Guest**: submit triage request and track updates
- **Nurse**: review and triage cases, add recommendations, send to doctor
- **Doctor**: review forwarded cases, request patient, and conclude cases

---

## 2) Accessing the app

Open the app in your browser (organization-provided URL).

Typical navigation:

- `Start triage` - for patient/guest submission
- `ED queue` - anonymized public queue status
- `Staff` - nurse/doctor login

---

## 3) Patient / Guest Guide

## 3.1 Start a new triage request

1. Click **Start triage**.
2. Enter your details:
   - age / gender
   - chief complaint
   - urgency level (1-5)
   - symptoms list
3. Submit the form.

After submit, the system creates your case and starts tracking status.

## 3.2 Guest OTP verification (if prompted)

For guest users, email verification is required:

1. Enter email and click **Send OTP**.
2. Check your email for the code.
3. Enter code and verify.

If code expires, send a new OTP and use the latest code.

## 3.3 Track your case

The page updates your case status and care-team notes.

Possible statuses shown to patient:

- **Submitted** - request received
- **Under review** - nurse is reviewing
- **Nurse follow-up (watch)** - nurse monitoring and will review again
- **Awaiting doctor review** - nurse sent case to doctor
- **Doctor requested - go to nursing desk** - doctor is ready to see you
- **Completed** - case closed by care team
- **Withdrawn / Resolved** - case closed without full completion path

## 3.4 Understand recommendations and alerts

You may see:

- nurse recommendations
- triage level updates
- doctor desk/request alerts

Follow the latest clinical instruction shown on the page.

## 3.5 Optional patient actions

Depending on status, you may be allowed to:

- withdraw your request
- mark issue as self-resolved

These options are disabled once the case is fully concluded.

---

## 4) Nurse Guide

## 4.1 Sign in

1. Go to **Staff**.
2. Login as a nurse account.
3. You are redirected to the **Nurse dashboard**.

## 4.2 Review queue

In the dashboard, open incoming cases and inspect:

- demographics
- complaint and symptoms
- urgency and automated triage suggestion
- timestamps and current status

## 4.3 Make triage decisions

For each case, nurse can:

- accept automated triage level
- override triage level with reason
- add nurse recommendation text for patient guidance
- set watch/follow-up when needed
- forward case for doctor review

## 4.4 React to doctor request

When a doctor requests a patient:

- nurse sees updated case state
- nurse coordinates patient movement to care area

Nurse may reopen eligible cases if further review is needed before final conclusion.

---

## 5) Doctor Guide

## 5.1 Sign in

1. Go to **Staff**.
2. Login as a doctor account.
3. You are redirected to the **Doctor dashboard**.

## 5.2 Use dashboard tabs

### Under review

Cases sent by nursing for doctor review. Cards show key details.

### Requested

Cases where the doctor has requested patient to come to desk/clinical area.

### Completed / history

Cases concluded by the doctor (with nurse + doctor attribution).

## 5.3 Open case details and take action

From a case card, doctor can:

1. Review full case details
2. Read nurse recommendation and override notes
3. Click **Request patient at desk** (if still under review)
4. Click **Mark case complete** after consultation

Status changes are controlled by workflow (doctor request and doctor completion).

---

## 6) Public Queue Guide

The **ED queue** page is a public-facing, anonymized summary.

It shows:

- pending count
- active count
- concluded count
- anonymized pipeline entries (no patient identity)

No personal health details are shown on this page.

---

## 7) Common user issues

## OTP email not received

- check spam/junk folder
- wait briefly and resend OTP
- use only the latest OTP code

## Session or page refresh

- reopen triage page and continue with same email/account
- case tracking normally resumes automatically

## Cannot perform an action

- action may be restricted by current case status
- wait for next workflow step or contact clinical staff

---

## 8) Safety and privacy notes

- This system is for triage workflow support.
- Follow clinical staff instructions at all times.
- Public queue is anonymized by design.
- Do not share OTP codes with anyone.

---

## 9) Quick role summary

- **Patient/Guest**: Submit triage -> track status -> follow recommendations
- **Nurse**: Review -> adjust triage -> guide patient -> forward to doctor
- **Doctor**: Review -> request patient -> complete case

---

## 10) Support

If you need help using the platform, contact your organization/course support contact and include:

- your role (patient, nurse, doctor)
- what page you were using
- what action failed
- screenshot/error message (if any)
