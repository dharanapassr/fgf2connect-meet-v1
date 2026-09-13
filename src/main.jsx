import React, { useMemo, useRef, useState } from 'react';
import { DisconnectReason } from 'livekit-client';
import { createRoot } from 'react-dom/client';
import {
  LiveKitRoom,
  PreJoin,
  VideoConference,
  RoomAudioRenderer,
  useParticipants,
} from '@livekit/components-react';
import '@livekit/components-styles';
import './styles.css';
import {
  MicOff,
  UserX,
  Copy,
  Lock,
  Unlock,
  LogOut,
  Users,
  Video,
  ShieldCheck,
} from 'lucide-react';

const API = '/api';
const MEDIA_DEVICE_ERROR_NAMES = new Set([
  'NotAllowedError',
  'PermissionDeniedError',
  'NotFoundError',
  'DevicesNotFoundError',
  'NotReadableError',
  'TrackStartError',
  'OverconstrainedError',
]);

function isLineInAppBrowser() {
  return /\bLine\//i.test(navigator.userAgent);
}

function LineBrowserGate() {
  const externalUrl = new URL(window.location.href);
  externalUrl.searchParams.set('openExternalBrowser', '1');
  const httpsUrl = externalUrl.toString();
  const isAndroid = /Android/i.test(navigator.userAgent);
  const externalHref = isAndroid
    ? `intent://${externalUrl.host}${externalUrl.pathname}${externalUrl.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(httpsUrl)};end`
    : httpsUrl;

  return (
    <main className="prejoin-shell">
      <section className="prejoin-card line-browser-gate">
        <div className="brand compact">
          <div className="brand-mark"><Video size={22}/></div>
          <div><strong>FGF2CONNECT</strong><span>MEET</span></div>
        </div>
        <h2>เปิดห้องประชุมใน Browser</h2>
        <p>LINE ไม่รองรับการเปิดกล้องและไมโครโฟนสำหรับการประชุมนี้ กรุณาเปิดลิงก์ด้วย Chrome หรือ Browser ของเครื่อง</p>
        <a className="primary external-browser-button" href={externalHref}>
          เปิดด้วย {isAndroid ? 'Chrome' : 'Browser'}
        </a>
        <p className="privacy-note">หากปุ่มไม่เปิด Browser ให้กดเมนู ⋮ ของ LINE แล้วเลือก “เปิดในเบราว์เซอร์เริ่มต้น”</p>
      </section>
    </main>
  );
}

function roomFromPath() {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9_-]+)$/);
  return match ? match[1].toUpperCase() : '';
}

async function api(path, body = undefined) {
  const res = await fetch(`${API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'เกิดข้อผิดพลาด');
  return payload;
}

function Home() {
  const [code, setCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const createRoom = async () => {
    setCreating(true);
    setError('');
    try {
      const data = await api('/rooms', {});
      localStorage.setItem(`fgf-host:${data.room}`, data.hostToken);
      window.location.href = `/r/${data.room}`;
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  };

  const join = (e) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (clean) window.location.href = `/r/${clean}`;
  };

  return (
    <main className="home-shell">
      <section className="hero-card">
        <div className="brand">
          <div className="brand-mark"><Video size={25}/></div>
          <div>
            <strong>FGF2CONNECT</strong>
            <span>MEET</span>
          </div>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">MEETING CORE V1</p>
          <h1>ประชุมง่าย<br/>กดลิงก์ แล้วเข้าได้เลย</h1>
          <p className="sub">
            Guest ไม่ต้องสมัครสมาชิก ใส่ชื่อ เปิดกล้อง/ไมค์ แล้วเข้าห้องประชุมได้ทันที
          </p>
        </div>

        <button className="primary large" onClick={createRoom} disabled={creating}>
          {creating ? 'กำลังสร้างห้อง…' : '＋ สร้างห้องประชุม'}
        </button>

        <div className="divider"><span>หรือ</span></div>

        <form className="join-form" onSubmit={join}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ใส่รหัสห้อง"
            maxLength={20}
            autoCapitalize="characters"
          />
          <button className="secondary" type="submit">เข้าร่วม</button>
        </form>

        {error && <div className="error">{error}</div>}
        <p className="microcopy">รองรับ Mobile / Desktop · เป้าหมายทดสอบ 50 คน</p>
      </section>
    </main>
  );
}

function AdminPanel({ roomCode, hostToken, onClose }) {
  const participants = useParticipants();
  const [busy, setBusy] = useState('');
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');

  const call = async (action, extra = {}) => {
    setBusy(action);
    setMessage('');
    try {
      const out = await api(`/admin/${action}`, {
        room: roomCode,
        hostToken,
        ...extra,
      });
      if (typeof out.locked === 'boolean') setLocked(out.locked);
      setMessage(out.message || 'สำเร็จ');
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy('');
    }
  };

  const inviteUrl = new URL(`/r/${roomCode}`, window.location.origin);
  // LINE opens links with this documented parameter in the device's external
  // browser, where WebRTC camera and microphone capture are supported.
  inviteUrl.searchParams.set('openExternalBrowser', '1');
  const invite = inviteUrl.toString();

  const copyInvite = async () => {
    await navigator.clipboard.writeText(invite);
    setMessage('คัดลอกลิงก์เชิญแล้ว');
  };

  const endMeeting = async () => {
    if (!window.confirm('จบการประชุมสำหรับทุกคน?')) return;
    await call('end');
    window.location.href = '/';
  };

  return (
    <aside className="admin-panel">
      <div className="admin-head">
        <div>
          <div className="admin-title"><ShieldCheck size={18}/> Host Control</div>
          <small>ห้อง {roomCode}</small>
        </div>
        <button className="icon-btn" onClick={onClose}>×</button>
      </div>

      <div className="admin-actions">
        <button onClick={copyInvite}><Copy size={17}/> คัดลอกลิงก์เชิญ</button>
        <button onClick={() => call('mute-all')} disabled={!!busy}>
          <MicOff size={17}/> ปิดไมค์ทุกคน
        </button>
        <button onClick={() => call('lock', { locked: !locked })} disabled={!!busy}>
          {locked ? <Unlock size={17}/> : <Lock size={17}/>}
          {locked ? 'เปิดห้อง' : 'ล็อกห้อง'}
        </button>
      </div>

      <div className="participants-title"><Users size={16}/> ผู้เข้าร่วม {participants.length}</div>
      <div className="participant-list">
        {participants.map((p) => {
          const isHost = p.isLocal;
          return (
            <div className="participant-row" key={p.identity}>
              <div className="avatar">{(p.name || p.identity || '?').slice(0,1).toUpperCase()}</div>
              <div className="participant-name">
                <strong>{p.name || p.identity}</strong>
                <small>{isHost ? 'คุณ (Host)' : 'Guest'}</small>
              </div>
              {!isHost && (
                <div className="row-actions">
                  <button title="ปิดไมค์" onClick={() => call('mute', { identity: p.identity })}>
                    <MicOff size={15}/>
                  </button>
                  <button title="นำออก" onClick={() => call('remove', { identity: p.identity })}>
                    <UserX size={15}/>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {message && <div className="admin-message">{message}</div>}

      <button className="danger end-btn" onClick={endMeeting}>
        <LogOut size={17}/> จบการประชุมสำหรับทุกคน
      </button>
    </aside>
  );
}

function Meeting({ roomCode, joinInfo, userChoices, isHost, hostToken }) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const connected = useRef(false);
  const failed = useRef(false);

  const onError = (error) => {
    // LiveKit also calls onError when initial camera/microphone publication
    // fails after signaling connects. Keep the participant in the room so the
    // ControlBar can retry the device instead of showing a connection failure.
    if (MEDIA_DEVICE_ERROR_NAMES.has(error?.name)) {
      console.error('[LiveKit] initial media device failed', { errorType: error.name });
      return;
    }
    failed.current = true;
    // Never log the SDK error object: it may include a URL containing the JWT.
    const message = /invalid token|unauthorized|401/i.test(error?.message || '')
      ? 'LiveKit ปฏิเสธ Token กรุณาตรวจ API Secret และโปรเจกต์ LiveKit บน Server'
      : 'เชื่อมต่อ LiveKit ไม่สำเร็จ กรุณาตรวจเครือข่ายแล้วลองใหม่';
    console.error('[LiveKit] connection failed', { message, errorType: error?.name });
    setConnectionError(message);
  };

  if (connectionError) {
    return <main className="prejoin-shell"><section className="prejoin-card">
      <h2>ไม่สามารถเชื่อมต่อห้อง {roomCode}</h2>
      <div className="error" role="alert">{connectionError}</div>
      <button className="primary" onClick={() => window.location.reload()}>กลับไปลองเข้าห้องอีกครั้ง</button>
      <p><a href="/">กลับหน้าแรก</a></p>
    </section></main>;
  }

  return (
    <div className="meeting-shell">
      <LiveKitRoom
        serverUrl={joinInfo.serverUrl}
        token={joinInfo.token}
        connect={true}
        video={userChoices.videoEnabled}
        audio={userChoices.audioEnabled}
        onConnected={() => { connected.current = true; }}
        onError={onError}
        onMediaDeviceFailure={(failure, kind) => {
          console.error('[LiveKit] media device failure', { failure, kind });
        }}
        onDisconnected={(reason) => {
          if (connected.current && !failed.current && reason === DisconnectReason.CLIENT_INITIATED) {
            window.location.href = '/';
            return;
          }
          console.error('[LiveKit] disconnected', {
            reason: DisconnectReason[reason] || 'UNKNOWN',
            connectedPreviously: connected.current,
          });
          setConnectionError(previous => previous || `การเชื่อมต่อสิ้นสุด (${DisconnectReason[reason] || 'UNKNOWN'}) กรุณาลองเข้าห้องอีกครั้ง`);
        }}
        data-lk-theme="default"
      >
        <VideoConference />
        <RoomAudioRenderer />

        <div className="room-badge">
          <span className="live-dot"></span>
          ห้อง {roomCode}
        </div>

        {isHost && !adminOpen && (
          <button className="host-fab" onClick={() => setAdminOpen(true)}>
            <ShieldCheck size={18}/> Host
          </button>
        )}
        {isHost && adminOpen && (
          <AdminPanel
            roomCode={roomCode}
            hostToken={hostToken}
            onClose={() => setAdminOpen(false)}
          />
        )}
      </LiveKitRoom>
    </div>
  );
}

function RoomPage({ roomCode }) {
  const hostToken = useMemo(
    () => localStorage.getItem(`fgf-host:${roomCode}`) || '',
    [roomCode]
  );
  const isHost = !!hostToken;

  const [joinInfo, setJoinInfo] = useState(null);
  const [choices, setChoices] = useState(null);
  const [error, setError] = useState('');

  const join = async (values) => {
    setError('');
    try {
      const data = await api('/token', {
        room: roomCode,
        name: values.username.trim(),
        hostToken: hostToken || undefined,
      });
      if (typeof data.token !== 'string' || data.token.split('.').length !== 3) {
        throw new Error('Server ส่ง LiveKit Token ในรูปแบบไม่ถูกต้อง');
      }
      if (new URL(data.serverUrl).protocol !== 'wss:') {
        throw new Error('Server ต้องส่ง LiveKit URL แบบ wss://');
      }
      setChoices(values);
      setJoinInfo(data);
    } catch (e) {
      console.error('[LiveKit] join request failed', { errorType: e.name });
      setError(e.message);
    }
  };

  if (joinInfo && choices) {
    return (
      <Meeting
        roomCode={roomCode}
        joinInfo={joinInfo}
        userChoices={choices}
        isHost={joinInfo.role === 'host'}
        hostToken={hostToken}
      />
    );
  }

  return (
    <main className="prejoin-shell">
      <section className="prejoin-card">
        <div className="brand compact">
          <div className="brand-mark"><Video size={22}/></div>
          <div><strong>FGF2CONNECT</strong><span>MEET</span></div>
        </div>
        <div className="room-title">
          <p className="eyebrow">{isHost ? 'HOST' : 'GUEST'}</p>
          <h2>ห้อง {roomCode}</h2>
          <p>{isHost ? 'คุณเป็นผู้สร้างห้องนี้' : 'ใส่ชื่อที่ใช้ในการประชุม แล้วเข้าห้องได้เลย'}</p>
        </div>
        <div className="prejoin-box">
          <PreJoin
            onSubmit={join}
            persistUserChoices={true}
            joinLabel="เข้าร่วมประชุม"
            micLabel="ไมโครโฟน"
            camLabel="กล้อง"
            userLabel="ชื่อที่ใช้ในการประชุม"
          />
        </div>
        {error && <div className="error">{error}</div>}
        <p className="privacy-note">ไม่ต้อง Login · ชื่อที่กรอกจะแสดงต่อผู้เข้าร่วมในห้อง</p>
      </section>
    </main>
  );
}

function App() {
  if (isLineInAppBrowser()) return <LineBrowserGate/>;
  const roomCode = roomFromPath();
  return roomCode ? <RoomPage roomCode={roomCode}/> : <Home/>;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode><App/></React.StrictMode>
);
