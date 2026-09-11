import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  AccessToken,
  RoomServiceClient,
} from 'livekit-server-sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '64kb' }));

const PORT = Number(process.env.PORT || 3000);
const WS_URL = process.env.LIVEKIT_WS_URL;
const API_URL = process.env.LIVEKIT_API_URL;
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const APP_SECRET = process.env.APP_SECRET || '';

function requireConfig() {
  const missing = [];
  if (!WS_URL) missing.push('LIVEKIT_WS_URL');
  if (!API_URL) missing.push('LIVEKIT_API_URL');
  if (!API_KEY) missing.push('LIVEKIT_API_KEY');
  if (!API_SECRET) missing.push('LIVEKIT_API_SECRET');
  if (!APP_SECRET || APP_SECRET.length < 24) missing.push('APP_SECRET (อย่างน้อย 24 ตัวอักษร)');
  if (missing.length) throw new Error(`Server config missing: ${missing.join(', ')}`);
  if (new URL(WS_URL).protocol !== 'wss:') throw new Error('LIVEKIT_WS_URL must use wss://');
  if (new URL(API_URL).protocol !== 'https:') throw new Error('LIVEKIT_API_URL must use https://');
  if ([API_KEY, API_SECRET].some(value => value !== value.trim())) {
    throw new Error('LiveKit credentials contain leading or trailing whitespace');
  }
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}
function signPayload(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', APP_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyPayload(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', APP_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

const roomState = new Map();

function makeRoomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(0, alphabet.length)];
  return s;
}

function sanitizeRoom(room) {
  const clean = String(room || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!clean || clean.length > 32) throw new Error('รหัสห้องไม่ถูกต้อง');
  return clean;
}

function sanitizeName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!clean) throw new Error('กรุณาใส่ชื่อที่ใช้ในการประชุม');
  return clean;
}

function livekitAdmin() {
  requireConfig();
  return new RoomServiceClient(API_URL, API_KEY, API_SECRET);
}

function assertHost(room, hostToken) {
  requireConfig();
  const payload = verifyPayload(hostToken);
  if (!payload || payload.role !== 'host' || payload.room !== room) {
    const err = new Error('ไม่มีสิทธิ์ Host สำหรับห้องนี้');
    err.status = 403;
    throw err;
  }
  return payload;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'FGF2CONNECT Meet V1' });
});

app.post('/api/rooms', (req, res) => {
  try {
    requireConfig();
    let room;
    do { room = makeRoomCode(); } while (roomState.has(room));

    const hostIdentity = `host-${crypto.randomUUID()}`;
    roomState.set(room, { locked: false, hostIdentity, createdAt: Date.now() });

    const hostToken = signPayload({
      role: 'host',
      room,
      hostIdentity,
      exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
    });

    res.json({ room, hostToken, inviteUrl: `/r/${room}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/token', async (req, res) => {
  try {
    requireConfig();
    const room = sanitizeRoom(req.body.room);
    const name = sanitizeName(req.body.name);

    let role = 'guest';
    let identity = `guest-${crypto.randomUUID()}`;

    if (req.body.hostToken) {
      const host = assertHost(room, req.body.hostToken);
      role = 'host';
      identity = host.hostIdentity;
      if (!roomState.has(room)) {
        roomState.set(room, { locked: false, hostIdentity: identity, createdAt: Date.now() });
      }
    } else {
      const state = roomState.get(room);
      if (state?.locked) {
        return res.status(423).json({ error: 'Host ล็อกห้องประชุมอยู่ ไม่สามารถเข้าร่วมได้ในขณะนี้' });
      }
    }

    const token = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name,
      ttl: '6h',
      metadata: JSON.stringify({ role }),
    });

    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      roomAdmin: role === 'host',
    });

    const jwt = await token.toJwt();
    if (typeof jwt !== 'string' || jwt.split('.').length !== 3) {
      throw new Error('LiveKit SDK did not return a valid JWT string');
    }
    res.set('Cache-Control', 'no-store');
    res.json({
      token: jwt,
      serverUrl: WS_URL,
      role,
      identity,
    });
  } catch (e) {
    console.error('[LiveKit] token issuance failed', { errorType: e.name, status: e.status || 400 });
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.post('/api/admin/mute-all', async (req, res) => {
  try {
    const room = sanitizeRoom(req.body.room);
    const host = assertHost(room, req.body.hostToken);
    const svc = livekitAdmin();
    const participants = await svc.listParticipants(room);
    let muted = 0;

    for (const participant of participants) {
      if (participant.identity === host.hostIdentity) continue;
      for (const track of participant.tracks || []) {
        // Audio tracks are reported with mime types beginning "audio/".
        if ((track.mimeType || '').startsWith('audio/') && !track.muted) {
          await svc.mutePublishedTrack(room, participant.identity, track.sid, true);
          muted++;
        }
      }
    }
    res.json({ ok: true, message: `ปิดไมค์ผู้เข้าร่วมแล้ว ${muted} track` });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.post('/api/admin/mute', async (req, res) => {
  try {
    const room = sanitizeRoom(req.body.room);
    assertHost(room, req.body.hostToken);
    const identity = String(req.body.identity || '');
    const svc = livekitAdmin();
    const participant = await svc.getParticipant(room, identity);
    let muted = 0;
    for (const track of participant.tracks || []) {
      if ((track.mimeType || '').startsWith('audio/') && !track.muted) {
        await svc.mutePublishedTrack(room, identity, track.sid, true);
        muted++;
      }
    }
    res.json({ ok: true, message: muted ? 'ปิดไมค์แล้ว' : 'ไมค์ถูกปิดอยู่แล้ว' });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.post('/api/admin/remove', async (req, res) => {
  try {
    const room = sanitizeRoom(req.body.room);
    const host = assertHost(room, req.body.hostToken);
    const identity = String(req.body.identity || '');
    if (!identity || identity === host.hostIdentity) {
      return res.status(400).json({ error: 'ไม่สามารถนำ Host ออกจากห้องด้วยคำสั่งนี้' });
    }
    const svc = livekitAdmin();
    await svc.removeParticipant(room, identity);
    res.json({ ok: true, message: 'นำผู้เข้าร่วมออกจากห้องแล้ว' });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.post('/api/admin/lock', (req, res) => {
  try {
    const room = sanitizeRoom(req.body.room);
    const host = assertHost(room, req.body.hostToken);
    const locked = Boolean(req.body.locked);
    roomState.set(room, {
      ...(roomState.get(room) || {}),
      hostIdentity: host.hostIdentity,
      locked,
      updatedAt: Date.now(),
    });
    res.json({
      ok: true,
      locked,
      message: locked ? 'ล็อกห้องแล้ว' : 'เปิดห้องแล้ว',
    });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

app.post('/api/admin/end', async (req, res) => {
  try {
    const room = sanitizeRoom(req.body.room);
    assertHost(room, req.body.hostToken);
    const svc = livekitAdmin();
    try { await svc.deleteRoom(room); } catch (_) {}
    roomState.delete(room);
    res.json({ ok: true, message: 'จบการประชุมแล้ว' });
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message });
  }
});

// Serve production build when present.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dist = path.resolve(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get('/{*splat}', (_req, res, next) => {
  const indexPath = path.join(dist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  console.log(`FGF2CONNECT Meet V1 listening on port ${PORT}`);
});
