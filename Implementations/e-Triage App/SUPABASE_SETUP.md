# Supabase backend setup for e - Triage

This guide walks you through connecting the e - Triage Node.js backend to a Supabase PostgreSQL database.

---

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**.
3. Choose your **organization** and set:
   - **Name:** e-triage (or any name)
   - **Database password:** Choose a strong password and **save it** (you need it for the connection string).
   - **Region:** Pick one close to you.
4. Click **Create new project** and wait for the project to be ready (1–2 minutes).

---

## 2. Get the database connection string

**Option A — Direct URL (easiest)**  
1. In Supabase, open your project so the URL looks like:  
   `https://supabase.com/dashboard/project/XXXXXXXX`  
2. Change the URL to add **`/settings/database`** at the end:  
   `https://supabase.com/dashboard/project/XXXXXXXX/settings/database`  
   (Keep your project ID in place of `XXXXXXXX`.)  
3. Press Enter. On that page, find **Connection string** / **Connection pooling**, open the **URI** tab, and copy the string.

**Option B — From the dashboard**  
1. Open your project.  
2. Click the **gear icon** (Project Settings).  
3. In the left sidebar, look for **Database** under Project Settings (you may need to scroll). Click it.  
4. If you don’t see Database, go to the project **home** (click the project name in the sidebar) and look for a **Connect** or **Connect to database** button; open it and copy the **URI** connection string.

**Then:**  
5. Copy the connection string. It looks like:  
   `postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`  
6. Replace `[YOUR-PASSWORD]` with the **database password** you set when creating the project.

**Tip:** For the Node.js app, the **Transaction** pooler (port **6543**) is recommended.

---

## 3. Configure the app with Supabase

1. In your project root, copy the example env file (if you haven’t already):
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and set:

   ```env
   # Server
   PORT=3001
   NODE_ENV=development

   # Supabase PostgreSQL (paste your connection string from step 2)
   DATABASE_URL=postgresql://postgres.[ref]:YOUR_ACTUAL_PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres

   # JWT secret (use a long random string in production)
   JWT_SECRET=your-secret-key-change-in-production

   # Optional: frontend URL for CORS
   CLIENT_ORIGIN=http://localhost:5173
   ```

3. Save the file. **Do not commit `.env`** (it should be in `.gitignore`).

---

## 4. Create the database schema in Supabase

The app expects tables `users`, `triage_cases`, and `audit_log`. You can create them in either of these ways.

### Option A: Run the init script (recommended)

From the project root, with `DATABASE_URL` set in `.env`:

```bash
npm run db:init
```

This runs `server/db/init.js`, which executes `server/db/schema.sql` against the database.

### Option B: Run the SQL manually in Supabase

1. In Supabase, go to **SQL Editor**.
2. Click **New query**.
3. Open `server/db/schema.sql` in your repo, copy its full contents, and paste into the editor.
4. Click **Run** (or press Ctrl/Cmd + Enter).

You should see success messages for the `CREATE TABLE` and index statements.

---

## 5. Create at least one staff user (nurse or doctor)

The app uses email + password login stored in the `users` table. Supabase does not create these for you; the app does via the **Register** API or you insert them manually.

### Option A: Register via API (after server is running)

1. Start the backend: `npm run server` (or `npm run dev`).
2. Send a POST request to register (e.g. with curl or Postman):

   **Nurse:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d "{\"email\":\"nurse@example.com\",\"password\":\"yourpassword\",\"role\":\"nurse\",\"full_name\":\"Demo Nurse\"}"
   ```

   **Doctor:**
   ```bash
   curl -X POST http://localhost:3001/api/auth/register \
     -H "Content-Type: application/json" \
     -d "{\"email\":\"doctor@example.com\",\"password\":\"yourpassword\",\"role\":\"doctor\",\"full_name\":\"Demo Doctor\"}"
   ```

   Use the returned `token` and `user` for login from the frontend.

### Option B: Insert a user in Supabase (with hashed password)

1. Generate a bcrypt hash for your password (e.g. in Node: `require('bcryptjs').hashSync('yourpassword', 10)`).
2. In Supabase **SQL Editor**, run:

   ```sql
   INSERT INTO users (email, password_hash, role, full_name)
   VALUES ('nurse@example.com', '$2a$10$...yourBcryptHash...', 'nurse', 'Demo Nurse');
   ```

Then log in from the app with that email and password.

---

## 6. Run the app

1. Start the backend (uses `DATABASE_URL` from `.env`):
   ```bash
   npm run server
   ```
   Or run backend + frontend together:
   ```bash
   npm run dev
   ```
2. Open the frontend (e.g. `http://localhost:5173`).
3. Use **Log in** with a staff account (nurse/doctor) created in step 5 — not “Enter as Nurse” (that’s demo mode with no backend).

---

## 7. Troubleshooting

| Issue | What to check |
|-------|----------------|
| **Connection refused / timeout** | Ensure `DATABASE_URL` is correct, password is replaced, and you’re using the right port (6543 for pooler). |
| **SSL error** | The app enables SSL when `DATABASE_URL` contains `supabase.com`. If you still see SSL errors, check Node and `pg` versions. |
| **Relation "users" does not exist** | Run the schema (step 4) so `users`, `triage_cases`, and `audit_log` exist. |
| **Invalid or expired token** | Log in again; JWT expiry is 7 days. Ensure `JWT_SECRET` is the same across restarts. |
| **CORS errors from frontend** | Set `CLIENT_ORIGIN` in `.env` to your frontend URL (e.g. `http://localhost:5173`). |

---

## Summary checklist

- [ ] Supabase project created and database is ready  
- [ ] Database password saved  
- [ ] `DATABASE_URL` in `.env` with password filled in  
- [ ] `JWT_SECRET` set in `.env`  
- [ ] Schema created (`npm run db:init` or SQL Editor)  
- [ ] At least one nurse or doctor user created (API or SQL)  
- [ ] Backend starts without errors (`npm run server`)  
- [ ] Can log in from the app with that user (no demo mode)

After this, the app uses Supabase as its PostgreSQL backend; demo mode (e.g. “Enter as Nurse” with no backend) still works when you don’t log in with a real account.
