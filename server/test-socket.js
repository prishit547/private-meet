import { io } from 'socket.io-client';

const SERVER_URL = 'http://127.0.0.1:7842';

console.log('--- Starting WebRTC Signaling & Waiting Room Test ---');

async function runTest() {
  // 1. Connect Host Socket
  const hostSocket = io(SERVER_URL, { transports: ['websocket'] });
  let createdRoomId = null;
  let hostToken = null;

  await new Promise((resolve) => hostSocket.on('connect', resolve));
  console.log('✓ Host connected to server:', hostSocket.id);

  // 2. Host creates room
  await new Promise((resolve, reject) => {
    hostSocket.emit('create-room', { hostName: 'Host Alice' }, (res) => {
      if (res.success) {
        createdRoomId = res.roomId;
        hostToken = res.hostToken;
        console.log(`✓ Host created room: ${createdRoomId}`);
        resolve();
      } else {
        reject(new Error(res.error));
      }
    });
  });

  // 3. Guest connects to server
  const guestSocket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((resolve) => guestSocket.on('connect', resolve));
  console.log('✓ Guest connected to server:', guestSocket.id);

  // 4. Guest knocks on room
  const knockPromise = new Promise((resolve) => {
    hostSocket.on('guest-knock', ({ guest }) => {
      console.log(`✓ Host received knocking alert for guest: "${guest.name}" (${guest.socketId})`);
      resolve(guest);
    });
  });

  await new Promise((resolve) => {
    guestSocket.emit('join-room', { roomId: createdRoomId, name: 'Bob Guest' }, (res) => {
      console.log('✓ Guest join-room response:', res.status); // should be 'waiting'
      resolve();
    });
  });

  const waitingGuest = await knockPromise;

  // 5. Host admits guest
  const guestApprovedPromise = new Promise((resolve) => {
    guestSocket.on('join-approved', (data) => {
      console.log(`✓ Guest received "join-approved"! Role: ${data.role}, Peer count: ${data.participants.length}`);
      resolve(data);
    });
  });

  await new Promise((resolve) => {
    hostSocket.emit('host-admit', { roomId: createdRoomId, guestSocketId: waitingGuest.socketId }, (res) => {
      console.log('✓ Host admit response:', res.success);
      resolve();
    });
  });

  await guestApprovedPromise;

  // 6. Test WebRTC signaling relay
  const signalPromise = new Promise((resolve) => {
    guestSocket.on('signal-offer', ({ from, offer }) => {
      console.log(`✓ Guest received WebRTC offer from: ${from}`);
      resolve();
    });
  });

  hostSocket.emit('signal-offer', {
    to: guestSocket.id,
    offer: { type: 'offer', sdp: 'mock-sdp-data' }
  });

  await signalPromise;

  // 7. Test in-call chat
  const chatPromise = new Promise((resolve) => {
    hostSocket.on('chat-message', (msg) => {
      console.log(`✓ Host received chat message from ${msg.senderName}: "${msg.message}"`);
      resolve();
    });
  });

  guestSocket.emit('chat-message', {
    roomId: createdRoomId,
    message: 'Hello Host, screen sharing is working!'
  });

  await chatPromise;

  // 8. Test host ending meeting
  const endPromise = new Promise((resolve) => {
    guestSocket.on('meeting-ended', (data) => {
      console.log(`✓ Guest received "meeting-ended": "${data.message}"`);
      resolve();
    });
  });

  hostSocket.emit('host-end-meeting', { roomId: createdRoomId });
  await endPromise;

  // Cleanup
  hostSocket.disconnect();
  guestSocket.disconnect();

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉\n');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
