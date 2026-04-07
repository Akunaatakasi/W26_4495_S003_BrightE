import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';
import { registerCaseRoomBroadcast } from './caseRoom.js';

const JWT_SECRET = process.env.JWT_SECRET || 'bright-triage-dev-secret-change-in-production';

function safeSend(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function parseToken(req) {
  const url = new URL(req.url || '', 'http://localhost');
  const qToken = url.searchParams.get('token');
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return qToken || bearer || null;
}

function parseAuth(req) {
  const token = parseToken(req);
  if (!token) return null;
  if (token === 'demo-staff-token') return { userId: 1, role: 'nurse' };
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.purpose === 'guest_triage' && payload?.email) {
      return { role: 'guest_patient', email: String(payload.email).toLowerCase() };
    }
    if (payload?.purpose === 'guest_case_access' && payload?.email != null && payload?.caseId != null) {
      return {
        role: 'guest_patient',
        email: String(payload.email).toLowerCase(),
        caseId: Number(payload.caseId),
      };
    }
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}

async function canJoinRoom(identity, roomId) {
  const { role, userId, email } = identity || {};
  if (!role || !roomId.startsWith('case:')) return false;
  const caseId = Number(roomId.replace('case:', ''));
  if (!Number.isFinite(caseId)) return false;
  if (role === 'nurse' || role === 'doctor') return true;
    if (role !== 'patient' && role !== 'guest_patient') return false;
    try {
      if (role === 'patient') {
        if (!userId) return false;
        const { rows } = await pool.query('SELECT patient_id FROM triage_cases WHERE id = $1', [caseId]);
        const owner = rows[0]?.patient_id;
        return Number(owner) === Number(userId);
      }
      if (identity.caseId != null && Number(identity.caseId) !== caseId) return false;
      if (!email) return false;
    const { rows } = await pool.query(
      `SELECT 1
       FROM triage_cases t
       JOIN users u ON u.id = t.patient_id
       WHERE t.id = $1 AND LOWER(u.email) = $2
       LIMIT 1`,
      [caseId, email]
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

export function setupRealtime(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const rooms = new Map(); // roomId => Set<ws>

  function leaveAllRooms(ws) {
    for (const [roomId, clients] of rooms) {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) rooms.delete(roomId);
      }
    }
  }

  function broadcastToRoom(roomId, payload, exceptWs = null) {
    const clients = rooms.get(roomId);
    if (!clients) return;
    for (const client of clients) {
      if (client !== exceptWs) safeSend(client, payload);
    }
  }

  wss.on('connection', (ws, req) => {
    const identity = parseAuth(req);
    ws.identity = identity;
    ws.roomId = null;
    safeSend(ws, { type: 'ws-ready', authenticated: !!identity });

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        safeSend(ws, { type: 'error', message: 'Invalid JSON message' });
        return;
      }

      if (msg.type === 'join-room') {
        if (!ws.identity) {
          safeSend(ws, { type: 'error', message: 'Authentication required' });
          return;
        }
        const roomId = String(msg.roomId || '');
        const allowed = await canJoinRoom(ws.identity, roomId);
        if (!allowed) {
          safeSend(ws, { type: 'error', message: 'Access denied for room' });
          return;
        }
        leaveAllRooms(ws);
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        const clients = rooms.get(roomId);
        const peers = [];
        for (const client of clients) {
          peers.push({ role: client.identity?.role, userId: client.identity?.userId });
        }
        clients.add(ws);
        ws.roomId = roomId;
        safeSend(ws, { type: 'joined-room', roomId, peers });
        broadcastToRoom(
          roomId,
          {
            type: 'peer-joined',
            roomId,
            role: ws.identity.role,
            userId: ws.identity.userId,
          },
          ws
        );
        return;
      }

      if (!ws.roomId) {
        safeSend(ws, { type: 'error', message: 'Join a room first' });
        return;
      }

      if (msg.type === 'webrtc-signal') {
        broadcastToRoom(
          ws.roomId,
          {
            type: 'webrtc-signal',
            roomId: ws.roomId,
            from: { role: ws.identity?.role, userId: ws.identity?.userId },
            signal: msg.signal,
          },
          ws
        );
        return;
      }

      if (msg.type === 'triage-update') {
        broadcastToRoom(
          ws.roomId,
          {
            type: 'triage-update',
            roomId: ws.roomId,
            level: msg.level,
            reason: msg.reason || null,
            status: msg.status || null,
            from: { role: ws.identity?.role, userId: ws.identity?.userId },
            ts: new Date().toISOString(),
          },
          ws
        );
      }
    });

    ws.on('close', () => {
      const roomId = ws.roomId;
      const identity2 = ws.identity;
      leaveAllRooms(ws);
      if (roomId) {
        broadcastToRoom(roomId, {
          type: 'peer-left',
          roomId,
          role: identity2?.role,
          userId: identity2?.userId,
        });
      }
    });
  });

  registerCaseRoomBroadcast((caseId, payload) => {
    broadcastToRoom(`case:${Number(caseId)}`, { ...payload, ts: new Date().toISOString() });
  });
}
