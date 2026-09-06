import { v4 as uuidv4 } from 'uuid';

/**
 * Generates a clean room code like: abc-defg-hij
 */
function generateRoomCode() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const segment = (len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${segment(3)}-${segment(4)}-${segment(3)}`;
}

class RoomManager {
  constructor() {
    // roomId -> Room
    this.rooms = new Map();
    // socketId -> roomId
    this.socketToRoom = new Map();
  }

  /**
   * Create a new meeting room
   */
  createRoom(hostName = 'Host') {
    const roomId = generateRoomCode();
    const hostToken = uuidv4();

    const room = {
      id: roomId,
      hostToken,
      hostSocketId: null,
      createdAt: Date.now(),
      participants: new Map(), // socketId -> participant
      waitingRoom: new Map(),  // socketId -> waiting guest
    };

    this.rooms.set(roomId, room);
    return { roomId, hostToken };
  }

  getRoom(roomId) {
    return this.rooms.get(roomId) || null;
  }

  /**
   * Verify if a host token belongs to the room
   */
  isHostToken(roomId, hostToken) {
    const room = this.getRoom(roomId);
    if (!room) return false;
    return room.hostToken === hostToken;
  }

  /**
   * Assign or reclaim host socket
   */
  claimHost(roomId, socketId, hostToken, hostName = 'Host') {
    const room = this.getRoom(roomId);
    if (!room || room.hostToken !== hostToken) {
      return { success: false, error: 'Invalid host credentials' };
    }

    room.hostSocketId = socketId;
    this.socketToRoom.set(socketId, roomId);

    // Add or update host in participants
    const hostParticipant = {
      socketId,
      name: hostName,
      role: 'host',
      joinedAt: Date.now(),
      mediaState: { audio: true, video: true, screen: false }
    };
    room.participants.set(socketId, hostParticipant);

    return { success: true, participant: hostParticipant };
  }

  /**
   * Guest knocks on the room
   */
  requestJoin(roomId, socketId, name) {
    const room = this.getRoom(roomId);
    if (!room) {
      return { status: 'error', message: 'Room does not exist' };
    }

    // Check if host is present
    if (!room.hostSocketId) {
      return { status: 'waiting_host', message: 'Host has not joined yet' };
    }

    const waitingUser = {
      socketId,
      name: name || 'Guest',
      requestedAt: Date.now()
    };

    room.waitingRoom.set(socketId, waitingUser);
    this.socketToRoom.set(socketId, roomId);

    return { status: 'waiting', waitingUser, hostSocketId: room.hostSocketId };
  }

  /**
   * Host admits a waiting user
   */
  admitUser(roomId, guestSocketId, hostSocketId) {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.hostSocketId !== hostSocketId) return { success: false, error: 'Unauthorized' };

    const guest = room.waitingRoom.get(guestSocketId);
    if (!guest) return { success: false, error: 'User is not in the waiting room' };

    room.waitingRoom.delete(guestSocketId);

    const participant = {
      socketId: guestSocketId,
      name: guest.name,
      role: 'guest',
      joinedAt: Date.now(),
      mediaState: { audio: true, video: true, screen: false }
    };

    room.participants.set(guestSocketId, participant);
    return { success: true, participant };
  }

  /**
   * Host rejects a waiting user
   */
  rejectUser(roomId, guestSocketId, hostSocketId) {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.hostSocketId !== hostSocketId) return { success: false, error: 'Unauthorized' };

    const guest = room.waitingRoom.get(guestSocketId);
    room.waitingRoom.delete(guestSocketId);
    this.socketToRoom.delete(guestSocketId);

    return { success: true, guest };
  }

  /**
   * Update participant media state (mic, cam, screen)
   */
  updateMediaState(socketId, mediaState) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    const participant = room.participants.get(socketId);
    if (participant) {
      participant.mediaState = { ...participant.mediaState, ...mediaState };
      return { roomId, participant };
    }
    return null;
  }

  /**
   * Host kicks a participant
   */
  kickUser(roomId, targetSocketId, hostSocketId) {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found' };
    if (room.hostSocketId !== hostSocketId) return { success: false, error: 'Unauthorized' };
    if (targetSocketId === hostSocketId) return { success: false, error: 'Host cannot kick themselves' };

    const removed = room.participants.get(targetSocketId);
    if (removed) {
      room.participants.delete(targetSocketId);
      this.socketToRoom.delete(targetSocketId);
      return { success: true, participant: removed };
    }
    return { success: false, error: 'User not found in room' };
  }

  /**
   * Remove a user on disconnect or voluntary leave
   */
  handleDisconnect(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    this.socketToRoom.delete(socketId);
    const room = this.rooms.get(roomId);
    if (!room) return null;

    // Check if user was waiting
    if (room.waitingRoom.has(socketId)) {
      const waiting = room.waitingRoom.get(socketId);
      room.waitingRoom.delete(socketId);
      return {
        type: 'waiting_cancelled',
        roomId,
        guest: waiting,
        hostSocketId: room.hostSocketId
      };
    }

    // Check if user was participant
    const participant = room.participants.get(socketId);
    if (participant) {
      room.participants.delete(socketId);
      const isHost = (room.hostSocketId === socketId);

      if (isHost) {
        room.hostSocketId = null;
      }

      // If room is completely empty, clean it up after a grace period
      if (room.participants.size === 0 && room.waitingRoom.size === 0) {
        // Automatically delete empty rooms after 10 minutes
        setTimeout(() => {
          const currentRoom = this.rooms.get(roomId);
          if (currentRoom && currentRoom.participants.size === 0) {
            this.rooms.delete(roomId);
          }
        }, 10 * 60 * 1000);
      }

      return {
        type: 'participant_left',
        roomId,
        participant,
        isHost,
        remainingCount: room.participants.size
      };
    }

    return null;
  }

  /**
   * Get safe participant list (without sensitive host tokens)
   */
  getParticipantsList(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return Array.from(room.participants.values());
  }

  /**
   * Get safe waiting room list
   */
  getWaitingList(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return Array.from(room.waitingRoom.values());
  }
}

export const roomManager = new RoomManager();
