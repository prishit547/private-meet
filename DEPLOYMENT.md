# 🚀 Deployment Guide: Docker & Cloudflare Tunnel

This guide walks you through deploying **PrivateMeet** using Docker Compose and connecting it to your domain via **Cloudflare Tunnel**.

---

## 🏗️ Architecture Overview

```
[Users / Clients]
       │  (HTTPS / WSS)
       ▼
[Cloudflare Edge (SSL Termination)]
       │
  (Cloudflare Tunnel)
       │
  (cloudflared daemon on host)
       │  http://127.0.0.1:7842
       ▼
[Docker Container: private-meet]
  - Node.js Express + Socket.IO (Signaling)
  - React Production SPA (Assets)
```

- **Why this is ideal for WebRTC**:
  - Cloudflare automatically provides **trusted SSL (HTTPS)** on your subdomain (e.g. `https://meet.yourdomain.com`).
  - Browsers require HTTPS to grant camera, microphone, and screen-sharing permissions.
  - You do **not** need to generate or install local SSL certificates in Docker.
  - WebSockets (Socket.IO signaling) pass through Cloudflare Tunnel natively.
  - Video, voice, and screen-share streams flow **peer-to-peer (WebRTC)** directly between browsers, encrypted end-to-end.

---

## 1️⃣ Launching with Docker Compose

1. Make sure **Docker Desktop** (or your Docker engine) is running on your machine.
2. If you currently have the local dev server running on port 7842, stop it first:
   ```bash
   # (Optional) Stop local node process if running
   lsof -ti:7842 | xargs kill -9
   ```
3. Build and launch the container in detached mode:
   ```bash
   docker compose up -d --build
   ```
4. Verify the container is running and healthy:
   ```bash
   docker compose ps
   ```
   You can also test the local health endpoint:
   ```bash
   curl http://127.0.0.1:7842/api/health
   # Expected output: {"status":"ok","time":"..."}
   ```

---

## 2️⃣ Connecting to Cloudflare Tunnel

You can route your subdomain to the Docker container either via the **Cloudflare Dashboard** (recommended) or via your local **`config.yml`**.

### Option A: Via Cloudflare Zero Trust Dashboard (Recommended)

1. Open the [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/).
2. Navigate to **Networks** ➔ **Tunnels**.
3. Click on your active tunnel and select **Configure**.
4. Go to the **Public Hostname** tab and click **Add a public hostname**.
5. Fill in the fields:
   - **Subdomain**: `meet` *(or any subdomain of your choice, e.g. `call`, `share`)*
   - **Domain**: Select your domain from the dropdown (e.g. `yourdomain.com`)
   - **Path**: *(leave empty)*
   - **Type**: `HTTP`
   - **URL**: `127.0.0.1:7842` *(or `localhost:7842`)*
6. Under **Additional application settings** ➔ **HTTP Settings**:
   - Ensure standard HTTP settings are default (Cloudflare automatically proxies WebSockets).
7. Click **Save hostname**.

---

### Option B: Via Local `config.yml` (CLI Managed)

If you manage your tunnel through a configuration file (typically at `~/.cloudflared/config.yml`):

1. Edit your `~/.cloudflared/config.yml`:
   ```yaml
   tunnel: <YOUR-TUNNEL-UUID>
   credentials-file: /Users/<your-user>/.cloudflared/<YOUR-TUNNEL-UUID>.json

   ingress:
     # Route your custom subdomain to Docker
     - hostname: meet.yourdomain.com
       service: http://127.0.0.1:7842

     # Fallback rule
     - service: http_status:404
   ```

2. Add the DNS CNAME record for your subdomain (if not already done):
   ```bash
   cloudflared tunnel route dns <YOUR-TUNNEL-NAME-OR-UUID> meet.yourdomain.com
   ```

3. Restart your `cloudflared` service:
   ```bash
   brew services restart cloudflared
   # Or if running manually:
   cloudflared tunnel run <YOUR-TUNNEL-NAME>
   ```

---

## 3️⃣ Cloudflare WebSockets Verification

WebSockets are required for the instant signaling engine (guest knocking, room admission, track toggling):

1. Go to your standard [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Select your domain ➔ **Network**.
3. Ensure the **WebSockets** toggle is set to **ON** *(it is enabled by default on all Cloudflare plans)*.

---

## 4️⃣ Useful Docker Management Commands

- **View Live Logs:**
  ```bash
  docker compose logs -f
  ```
- **Restart Container:**
  ```bash
  docker compose restart
  ```
- **Stop Container:**
  ```bash
  docker compose down
  ```
- **Rebuild After Modifying Code:**
  ```bash
  docker compose up -d --build
  ```

---

## 5️⃣ Verification Checklist

- [ ] Open `https://meet.yourdomain.com` in your browser.
- [ ] Verify the padlock icon appears (indicating valid HTTPS).
- [ ] Click **"New Meeting"** to create a room as Host.
- [ ] Open an Incognito window or test from another laptop/phone on mobile data.
- [ ] Paste the meeting link, enter a name, and click **"Ask to join"**.
- [ ] Confirm the Host gets the knocking alert and clicks **[Admit]**.
- [ ] Click **Screen Share** and confirm high-definition screen streaming with system audio!
