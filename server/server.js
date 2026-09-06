import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { roomManager } from './rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Trust reverse proxies (Cloudflare Tunnel, Nginx, etc.)
app.set('trust proxy', 1);

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));
app.use(express.json());

// API endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/ice-servers', (req, res) => {
  res.json({ iceServers: config.iceServers });
});

// Serve frontend build if dist folder exists (supports local and container paths)
const candidateDistPaths = [
  path.join(__dirname, '../client/dist'),
  path.join(__dirname, './client/dist'),
  path.join(process.cwd(), 'client/dist'),
  path.join(process.cwd(), 'dist')
];
const clientDistPath = candidateDistPaths.find(p => fs.existsSync(p));

if (clientDistPath) {
  console.log(`[Static] Serving frontend from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  console.warn('[Static] No frontend dist folder found; only API/Signaling active');
}

// Create HTTP or HTTPS server
let server;
if (config.useHttps && config.sslKeyPath && config.sslCertPath) {
  try {
    const key = fs.readFileSync(config.sslKeyPath);
    const cert = fs.readFileSync(config.sslCertPath);
    server = https.createServer({ key, cert }, app);
    console.log('[Server] Initialized with HTTPS');
  } catch (err) {
    console.warn('[Server] HTTPS setup failed, falling back to HTTP:', err.message);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,
  pingInterval: 15000
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // 1. Create a new room
  socket.on('create-room', ({ hostName }, callback) => {
    try {
      const { roomId, hostToken } = roomManager.createRoom(hostName);
      const claim = roomManager.claimHost(roomId, socket.id, hostToken, hostName);

      if (!claim.success) {
        return callback({ error: claim.error });
      }

      socket.join(roomId);
      console.log(`[Room] Created: ${roomId} by host: ${hostName} (${socket.id})`);

      callback({
        success: true,
        roomId,
        hostToken,
        participant: claim.participant,
        iceServers: config.iceServers
      });
    } catch (err) {
      console.error('[create-room error]', err);
      callback({ error: 'Failed to create room' });
    }
  });

  // 2. Request or Reconnect to a Room
  socket.on('join-room', ({ roomId, hostToken, name }, callback) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        return callback({ status: 'not_found', message: 'Room not found' });
      }

      // Check if caller is Host reclaiming session
      if (hostToken && roomManager.isHostToken(roomId, hostToken)) {
        const claim = roomManager.claimHost(roomId, socket.id, hostToken, name);
        if (claim.success) {
          socket.join(roomId);
          console.log(`[Room] Host reconnected to ${roomId}: ${socket.id}`);

          // Notify existing participants that host is here/updated
          socket.to(roomId).emit('user-joined', { participant: claim.participant });

          // Send current room state to host
          const participants = roomManager.getParticipantsList(roomId);
          const waitingList = roomManager.getWaitingList(roomId);

          return callback({
            status: 'admitted',
            role: 'host',
            participant: claim.participant,
            participants,
            waitingList,
            iceServers: config.iceServers
          });
        }
      }

      // Guest Knocking Flow
      const reqResult = roomManager.requestJoin(roomId, socket.id, name);

      if (reqResult.status === 'waiting') {
        console.log(`[Lobby] Guest "${name}" (${socket.id}) knocking on room ${roomId}`);

        // Notify host about the waiting guest
        if (reqResult.hostSocketId) {
          io.to(reqResult.hostSocketId).emit('guest-knock', {
            guest: reqResult.waitingUser
          });
        }

        return callback({
          status: 'waiting',
          message: 'Waiting for the host to let you in...'
        });
      }

      if (reqResult.status === 'waiting_host') {
        return callback({
          status: 'waiting_host',
          message: 'The meeting host has not joined yet. Please wait...'
        });
      }

      return callback({ status: 'error', message: reqResult.message });
    } catch (err) {
      console.error('[join-room error]', err);
      callback({ status: 'error', message: 'Failed to join room' });
    }
  });

  // 3. Host admits guest
  socket.on('host-admit', ({ roomId, guestSocketId }, callback) => {
    try {
      const result = roomManager.admitUser(roomId, guestSocketId, socket.id);
      if (!result.success) {
        return callback && callback({ error: result.error });
      }

      const guestSocket = io.sockets.sockets.get(guestSocketId);
      if (guestSocket) {
        guestSocket.join(roomId);

        const currentParticipants = roomManager.getParticipantsList(roomId);

        // Notify admitted guest
        guestSocket.emit('join-approved', {
          role: 'guest',
          participant: result.participant,
          participants: currentParticipants,
          iceServers: config.iceServers
        });

        // Notify existing peers (including host) to connect to new participant
        socket.to(roomId).emit('user-joined', { participant: result.participant });
        socket.emit('user-joined', { participant: result.participant });
      }

      console.log(`[Lobby] Guest ${result.participant.name} admitted to room ${roomId}`);
      if (callback) callback({ success: true, participant: result.participant });
    } catch (err) {
      console.error('[host-admit error]', err);
      if (callback) callback({ error: 'Failed to admit guest' });
    }
  });

  // 4. Host rejects guest
  socket.on('host-reject', ({ roomId, guestSocketId }, callback) => {
    try {
      const result = roomManager.rejectUser(roomId, guestSocketId, socket.id);
      if (!result.success) {
        return callback && callback({ error: result.error });
      }

      const guestSocket = io.sockets.sockets.get(guestSocketId);
      if (guestSocket) {
        guestSocket.emit('join-rejected', {
          reason: 'The host has declined your request to join.'
        });
      }

      console.log(`[Lobby] Guest ${guestSocketId} rejected from room ${roomId}`);
      if (callback) callback({ success: true });
    } catch (err) {
      console.error('[host-reject error]', err);
      if (callback) callback({ error: 'Failed to reject guest' });
    }
  });

  // 5. WebRTC Peer-to-Peer Signaling Relays
  socket.on('signal-offer', (data) => {
    io.to(data.to).emit('signal-offer', { ...data, from: socket.id });
  });

  socket.on('signal-answer', (data) => {
    io.to(data.to).emit('signal-answer', { ...data, from: socket.id });
  });

  socket.on('signal-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('signal-ice-candidate', { from: socket.id, candidate });
  });

  // 6. Media Track State Synchronization (Mute / Cam / Screen toggle)
  socket.on('media-state-change', (mediaState) => {
    const updated = roomManager.updateMediaState(socket.id, mediaState);
    if (updated) {
      socket.to(updated.roomId).emit('peer-media-state-updated', {
        socketId: socket.id,
        mediaState: updated.participant.mediaState
      });
    }
  });

  // 7. Real-Time In-Call Chat (supports room-wide and direct private messaging)
  socket.on('chat-message', ({ roomId, message, targetSocketId }) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    const sender = room.participants.get(socket.id);
    if (!sender) return;

    let isDirect = false;
    let targetName = null;

    if (targetSocketId && targetSocketId !== 'everyone') {
      const recipient = room.participants.get(targetSocketId);
      if (recipient) {
        isDirect = true;
        targetName = recipient.name;
      }
    }

    const chatPayload = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      senderId: socket.id,
      senderName: sender.name,
      role: sender.role,
      message,
      isDirect,
      targetSocketId: isDirect ? targetSocketId : null,
      targetName: isDirect ? targetName : null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (isDirect) {
      // Send only to the recipient and back to the sender
      io.to(targetSocketId).emit('chat-message', chatPayload);
      socket.emit('chat-message', chatPayload);
    } else {
      // Broadcast to everyone in the room
      io.to(roomId).emit('chat-message', chatPayload);
    }
  });

  // 8. Host Administrative Controls
  socket.on('host-kick', ({ roomId, targetSocketId }) => {
    const result = roomManager.kickUser(roomId, targetSocketId, socket.id);
    if (result.success) {
      const targetSocket = io.sockets.sockets.get(targetSocketId);
      if (targetSocket) {
        targetSocket.emit('kicked-by-host', { message: 'You have been removed from the meeting by the host.' });
        targetSocket.leave(roomId);
      }
      io.to(roomId).emit('user-left', {
        socketId: targetSocketId,
        name: result.participant.name,
        reason: 'kicked'
      });
    }
  });

  socket.on('host-end-meeting', ({ roomId }) => {
    const room = roomManager.getRoom(roomId);
    if (room && room.hostSocketId === socket.id) {
      io.to(roomId).emit('meeting-ended', { message: 'The host has ended the meeting for everyone.' });
      roomManager.rooms.delete(roomId);
    }
  });

  // 9. Clean Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    const res = roomManager.handleDisconnect(socket.id);

    if (!res) return;

    if (res.type === 'waiting_cancelled') {
      if (res.hostSocketId) {
        io.to(res.hostSocketId).emit('guest-knock-cancelled', { socketId: socket.id });
      }
    } else if (res.type === 'participant_left') {
      socket.to(res.roomId).emit('user-left', {
        socketId: socket.id,
        name: res.participant.name,
        isHost: res.isHost
      });
    }
  });
});

const PORT = config.port;
server.listen(PORT, config.host, () => {
  const protocol = config.useHttps ? 'https' : 'http';
  console.log(`\n======================================================`);
  console.log(`🚀 Private Video & Screen Sharing Server running!`);
  console.log(`📡 URL: ${protocol}://${config.host}:${PORT}`);
  console.log(`🔒 Privacy: 100% self-hosted; media is peer-to-peer`);
  console.log(`======================================================\n`);
});
