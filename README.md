# Private Meet - Self-Hosted Video Conferencing & Screen Sharing

A private, self-hosted web conferencing application (Google Meet alternative) designed to run entirely on your own Node.js server as the single source of truth.

No Google, no Discord, no cloud interception. Media streams connect peer-to-peer (WebRTC) encrypted end-to-end with DTLS/SRTP.

---

## 🌟 Key Features

- 🖥️ **HD Screen Sharing**: High-definition presentation mode with system/tab audio support.
- 🎙️ **Voice & Video Calling**: Multi-user microphone and webcam video support with dynamic grid and active-speaker highlighting.
- 🛡️ **Host & Waiting Room (Lobby)**:
  - Host initiates the call with a secure session key.
  - Guests arrive at a pre-join lobby to check camera/mic, enter their name, and click **"Ask to join"**.
  - Host receives live alert to **[Admit]** or **[Deny]** each knocking guest.
  - Host management: Mute participants, kick users, or end the meeting for all.
- 💬 **In-Call Chat**: Ephemeral real-time text chat (cleared when the room ends).
- 🔗 **Instant Meeting Links**: 1-click shareable links (`/room/abc-defg-hij`).
- 🔒 **100% Private**: Zero third-party telemetry, analytics, or cloud relays.

---

## 🚀 Quick Start

### 1. Installation

From the project root:
```bash
npm run install:all
```
*(Or install inside both `server/` and `client/` directories)*

### 2. Development Mode (Hot Reload)

Runs both the backend Node server and the Vite React frontend:
```bash
npm run dev
```
- Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Production Mode (Single Server)

Build the frontend bundle and serve everything from your Node.js server:
```bash
# Build the React frontend
npm run build

# Start the production server
npm start
```
- Server will listen on `http://0.0.0.0:3000`.

---

## 📱 Accessing from Other Devices / LAN (Important: HTTPS)

Modern browsers (Chrome, Firefox, Safari, Edge) strictly require a **Secure Context (HTTPS or localhost)** to access:
- `navigator.mediaDevices.getUserMedia` (Camera & Microphone)
- `navigator.mediaDevices.getDisplayMedia` (Screen Sharing)

### Option A: Testing on Localhost
If testing locally on the same laptop with multiple browser tabs or an incognito window, `http://localhost:3000` works out of the box.

### Option B: Enabling HTTPS for LAN / External Access

1. Generate a free local certificate using [`mkcert`](https://github.com/FiloSottile/mkcert):
   ```bash
   mkdir -p certs
   mkcert -install
   mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 192.168.1.50 # replace with your IP
   ```

2. Edit `server/.env`:
   ```ini
   PORT=3000
   HOST=0.0.0.0
   USE_HTTPS=true
   SSL_KEY_PATH=./certs/key.pem
   SSL_CERT_PATH=./certs/cert.pem
   ```

3. Restart the server:
   ```bash
   npm start
   ```
   Now access via `https://<your-ip>:3000`.

### Option C: Reverse Proxy (Recommended for Production)
Put an Nginx or Caddy reverse proxy with Let's Encrypt SSL in front of the Node server:
```caddy
# Example Caddyfile:
meet.yourdomain.com {
    reverse_proxy localhost:3000
}
```

---

## 🌐 Firewall / NAT Traversal (STUN / TURN)

- For **Local Area Networks (LAN)** or direct internet connections, WebRTC connects directly peer-to-peer.
- By default, standard public STUN servers (`stun.l.google.com:19302`) are included for NAT discovery.
- To make it **completely isolated and independent of Google's STUN**, you can run your own private [`coturn`](https://github.com/coturn/coturn) instance and configure it in `server/.env`:
  ```ini
  TURN_SERVER_URL=turn:your-turn-server.com:3478
  TURN_USERNAME=myuser
  TURN_PASSWORD=mypassword
  ```

---

## 📂 Project Structure

```
├── client/                     # Vite + React Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ControlBar.jsx          # Mic, Cam, Screen, Chat, Leave toolbar
│   │   │   ├── VideoGrid.jsx           # Dynamic grid & spotlight stage
│   │   │   ├── VideoTile.jsx           # Participant video & audio analyzer
│   │   │   ├── WaitingRoomModal.jsx    # Host knocking alert modal
│   │   │   ├── Lobby.jsx               # Pre-join camera/mic check
│   │   │   ├── ParticipantsDrawer.jsx  # Side drawer with kick controls
│   │   │   └── ChatDrawer.jsx          # In-call text messages
│   │   ├── hooks/
│   │   │   ├── useWebRTC.js            # Peer connection & track manager
│   │   │   └── useAudioLevel.js        # Active speaker detection
│   │   ├── services/
│   │   │   └── socket.js               # Socket.IO client instance
│   │   ├── pages/
│   │   │   ├── HomePage.jsx            # Landing page
│   │   │   └── MeetingPage.jsx         # Meeting orchestration
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── tailwind.config.js
│   └── vite.config.js
│
├── server/                     # Node.js Signaling & Room Management
│   ├── config.js               # Server and STUN/TURN configurations
│   ├── rooms.js                # State machine (host, lobby, participants)
│   ├── server.js               # Express, Socket.IO & static file server
│   ├── test-socket.js          # Automated end-to-end integration test
│   └── package.json
│
├── package.json                # Root orchestration scripts
└── README.md
```
