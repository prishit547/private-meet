import { io } from 'socket.io-client';

let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    // In dev, Vite proxies /socket.io to backend port 3000.
    // In production, backend serves the app on the same port.
    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
    socketInstance = io(serverUrl, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected to signaling server:', socketInstance.id);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });
  }

  return socketInstance;
}
