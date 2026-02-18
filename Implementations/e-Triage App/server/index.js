import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { triageRouter } from './routes/triage.js';
import { patientsRouter } from './routes/patients.js';
import { auditRouter } from './routes/audit.js';
import { otpRouter } from './routes/otp.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/triage', triageRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/otp', otpRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.use('/api', (_, res) => res.status(404).json({ error: 'API route not found' }));

const port = Number(PORT) || 3001;
const server = app.listen(port, () => console.log(`Server running at http://localhost:${server.address().port}`));
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is in use. Stop the other process or set PORT in .env (e.g. PORT=3002).`);
    process.exit(1);
  }
  throw err;
});
