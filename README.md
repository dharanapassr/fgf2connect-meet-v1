# FGF2CONNECT Meet — Meeting Core V1

MVP สำหรับ `meet.fgf2connect.com`

## ฟังก์ชันใน V1

### Guest
- ไม่ต้อง Login
- เปิด Invite Link แล้วใส่ชื่อ
- Preview กล้อง/ไมค์ก่อนเข้า
- เปิด/ปิดกล้องและไมค์
- เปลี่ยนอุปกรณ์
- Video conference
- Screen share
- Chat
- ออกจากห้อง

### Host
- สร้างห้องและได้รับสิทธิ์ Host
- Copy Invite Link
- Mute รายคน
- Mute All (ยกเว้น Host)
- Remove participant
- Lock / Unlock ห้อง
- End meeting for everyone

## Architecture

Browser (React + LiveKit Components)
→ Node/Express backend
→ LiveKit Cloud

API Secret อยู่บน Backend เท่านั้น ไม่ส่งไป Browser

## Setup

1. สร้าง Project ที่ LiveKit Cloud
2. Copy `.env.example` เป็น `.env`
3. ใส่:
   - LIVEKIT_WS_URL
   - LIVEKIT_API_URL
   - LIVEKIT_API_KEY
   - LIVEKIT_API_SECRET
   - APP_SECRET
4. ติดตั้ง dependency

```bash
npm install
```

5. Development

```bash
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:3000

6. Production

```bash
npm run build
npm start
```

เปิดเว็บผ่าน port ที่กำหนดใน `PORT`

## Deploy ที่ meet.fgf2connect.com

ต้องใช้ Hosting ที่รัน Node.js ได้ เช่น Render / Railway / Fly.io / VPS / Cloud Run
จากนั้น:
- ตั้ง Environment Variables ตาม `.env.example`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- ผูก Custom Domain: `meet.fgf2connect.com`

## Reality Test ก่อนเปิด 50 คน

1. ทดสอบ 2 คน คนละเครือข่าย
2. ทดสอบ Mobile ↔ Desktop
3. ทดสอบ Camera/Mic permissions
4. Screen share จาก Desktop
5. Chat
6. Host: Mute รายคน
7. Host: Mute All
8. Remove participant
9. Lock room แล้วลอง Guest ใหม่
10. End meeting แล้วตรวจว่าทุกคนหลุด
11. เพิ่ม Load 5 → 10 → 20 → 30 → 50 คน

## หมายเหตุสำคัญ

- V1 ยังไม่ทำ YouTube Live, Recording, AI Summary, FGF2CONNECT Login
- สถานะ Lock Room ใน V1 เก็บใน memory ของ Node server เพื่อให้ MVP เรียบง่าย ถ้า Scale หลาย server ควรย้าย state ไป Redis/Database
- Host token เก็บใน localStorage ของ browser ผู้สร้างห้อง จึงไม่ควรแชร์ browser profile เดียวกันกับผู้ที่ไม่ควรได้สิทธิ์ Host
