import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket.js';
import { useWebRTC } from '../hooks/useWebRTC.js';
import { Lobby } from '../components/Lobby.jsx';
import { VideoGrid } from '../components/VideoGrid.jsx';
import { ControlBar } from '../components/ControlBar.jsx';
import { WaitingRoomModal } from '../components/WaitingRoomModal.jsx';
import { ParticipantsDrawer } from '../components/ParticipantsDrawer.jsx';
import { ChatDrawer } from '../components/ChatDrawer.jsx';
import { ChatToast } from '../components/ChatToast.jsx';
import { RemoteAudioRenderer } from '../components/RemoteAudioRenderer.jsx';

// Gentle pop sound for incoming messages
function playChatChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } catch (e) {}
}

// Gentle two-tone doorbell chime using Web Audio API
function playKnockChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // First tone: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Second tone: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.16);
    gain2.gain.setValueAtTime(0.22, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.16);
    osc2.stop(now + 0.65);
  } catch (e) {
    console.warn('Could not play audio chime:', e);
  }
}

// Native OS desktop notification
function showDesktopNotification(title, body) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        body,
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238ab4f8'><path d='M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z'/></svg>",
        tag: 'guest-knock',
        requireInteraction: true // Stays visible until host clicks or dismisses it
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch (e) {
      console.warn('Desktop notification error:', e);
    }
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

export function MeetingPage({ roomId, onLeave }) {
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('pm_username') || '';
  });

  const [joinStatus, setJoinStatus] = useState('idle'); // 'idle' | 'waiting' | 'waiting_host' | 'admitted' | 'rejected'
  const [joinError, setJoinError] = useState('');
  const [role, setRole] = useState('guest'); // 'host' | 'guest'
  const [participants, setParticipants] = useState([]);
  const [waitingList, setWaitingList] = useState([]);
  const [iceServers, setIceServers] = useState([]);

  // UI Drawer states
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  const socket = getSocket();

  // Host token stored in localStorage for this roomId (if user created it)
  const hostToken = localStorage.getItem(`pm_host_token_${roomId}`);
  const isHostPreset = Boolean(hostToken);

  // Request browser notification permission for host
  useEffect(() => {
    if (role === 'host' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [role]);

  // Reset tab title when user refocuses the tab
  useEffect(() => {
    const handleFocus = () => {
      document.title = 'Private Meet - Secure Screen Sharing & Video';
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // WebRTC Hook
  const {
    localStream,
    screenStream,
    remotePeers,
    isAudioMuted,
    isVideoMuted,
    isScreenSharing,
    startLocalStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    initiateOffer,
    audioDevices,
    selectedAudioDevice,
    switchAudioDevice,
    audioOutputDevices,
    selectedAudioOutput,
    switchAudioOutput,
    refreshAudioDevices
  } = useWebRTC(roomId, iceServers);

  // Check if Host reconnecting or autojoin
  useEffect(() => {
    if (hostToken && joinStatus === 'idle') {
      const savedName = localStorage.getItem('pm_username') || 'Host';
      handleJoinRoom({ audioInitial: true, videoInitial: true, forceHost: true, name: savedName });
    }
  }, [roomId, hostToken]);

  // Handle Joining Room
  const handleJoinRoom = useCallback(async ({ audioInitial = true, videoInitial = true, forceHost = false, name = userName }) => {
    setJoinError('');
    localStorage.setItem('pm_username', name);

    socket.emit('join-room', {
      roomId,
      hostToken: forceHost ? hostToken : (isHostPreset ? hostToken : null),
      name
    }, async (response) => {
      console.log('[join-room response]', response);

      if (response.status === 'admitted') {
        setRole(response.role);
        setJoinStatus('admitted');
        setParticipants(response.participants || []);
        if (response.waitingList) setWaitingList(response.waitingList);
        if (response.iceServers) setIceServers(response.iceServers);

        // Start local media tracks
        await startLocalStream(audioInitial, videoInitial);
      } else if (response.status === 'waiting') {
        setJoinStatus('waiting');
      } else if (response.status === 'waiting_host') {
        setJoinStatus('waiting_host');
      } else {
        setJoinStatus('idle');
        setJoinError(response.message || 'Could not join meeting.');
      }
    });
  }, [roomId, hostToken, isHostPreset, userName, socket, startLocalStream]);

  // Socket Event Listeners for Room Orchestration
  useEffect(() => {
    // Guest gets approved by Host
    const handleJoinApproved = async (data) => {
      console.log('[Lobby] Join approved by host!', data);
      setRole('guest');
      setJoinStatus('admitted');
      setParticipants(data.participants || []);
      if (data.iceServers) setIceServers(data.iceServers);

      await startLocalStream(true, true);
    };

    // Guest gets rejected by Host
    const handleJoinRejected = (data) => {
      setJoinStatus('rejected');
      setJoinError(data.reason || 'The host declined your request.');
    };

    // Host receives knocking guest
    const handleGuestKnock = ({ guest }) => {
      console.log('[Host Alert] Guest knock:', guest);
      playKnockChime();
      showDesktopNotification(
        '👋 Guest Waiting to Join',
        `${guest.name} is in the waiting room and wants to enter the call.`
      );
      document.title = `🔔 ${guest.name} wants to join! - PrivateMeet`;

      setWaitingList(prev => {
        if (prev.some(g => g.socketId === guest.socketId)) return prev;
        return [...prev, guest];
      });
    };

    // Knocking guest leaves waiting room
    const handleGuestKnockCancelled = ({ socketId }) => {
      setWaitingList(prev => {
        const next = prev.filter(g => g.socketId !== socketId);
        if (next.length === 0) {
          document.title = 'Private Meet - Secure Screen Sharing & Video';
        }
        return next;
      });
    };

    // New participant joined the room
    const handleUserJoined = ({ participant }) => {
      setParticipants(prev => {
        if (prev.some(p => p.socketId === participant.socketId)) return prev;
        return [...prev, participant];
      });
      // Remove from waiting list if they were there
      setWaitingList(prev => {
        const next = prev.filter(g => g.socketId !== participant.socketId);
        if (next.length === 0) {
          document.title = 'Private Meet - Secure Screen Sharing & Video';
        }
        return next;
      });
    };

    // Participant left
    const handleUserLeft = ({ socketId }) => {
      setParticipants(prev => prev.filter(p => p.socketId !== socketId));
    };

    // Kicked by Host
    const handleKicked = (data) => {
      alert(data.message || 'You were removed from the meeting by the host.');
      onLeave();
    };

    // Meeting ended by Host
    const handleMeetingEnded = (data) => {
      alert(data.message || 'Meeting has ended.');
      localStorage.removeItem(`pm_host_token_${roomId}`);
      onLeave();
    };

    // In-call Chat Message
    const handleChatMessage = (message) => {
      setChatMessages(prev => [...prev, message]);

      // If message is from someone else:
      if (message.senderId !== socket.id) {
        playChatChime();

        if (!isChatOpen) {
          setUnreadChatCount(prev => prev + 1);
          setToastMessage(message); // Displays the on-screen floating toast notification
        }

        if (document.hidden) {
          showDesktopNotification(`💬 ${message.senderName}`, message.message);
          document.title = `💬 ${message.senderName}: ${message.message}`;
        }
      }
    };

    socket.on('join-approved', handleJoinApproved);
    socket.on('join-rejected', handleJoinRejected);
    socket.on('guest-knock', handleGuestKnock);
    socket.on('guest-knock-cancelled', handleGuestKnockCancelled);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('kicked-by-host', handleKicked);
    socket.on('meeting-ended', handleMeetingEnded);
    socket.on('chat-message', handleChatMessage);

    return () => {
      socket.off('join-approved', handleJoinApproved);
      socket.off('join-rejected', handleJoinRejected);
      socket.off('guest-knock', handleGuestKnock);
      socket.off('guest-knock-cancelled', handleGuestKnockCancelled);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('kicked-by-host', handleKicked);
      socket.off('meeting-ended', handleMeetingEnded);
      socket.off('chat-message', handleChatMessage);
    };
  }, [socket, startLocalStream, initiateOffer, isChatOpen, onLeave, roomId]);

  // Host Actions
  const handleAdmitGuest = (guestSocketId) => {
    socket.emit('host-admit', { roomId, guestSocketId }, (res) => {
      if (res?.success) {
        setWaitingList(prev => prev.filter(g => g.socketId !== guestSocketId));
      }
    });
  };

  const handleRejectGuest = (guestSocketId) => {
    socket.emit('host-reject', { roomId, guestSocketId }, (res) => {
      if (res?.success) {
        setWaitingList(prev => prev.filter(g => g.socketId !== guestSocketId));
      }
    });
  };

  const handleAdmitAll = () => {
    waitingList.forEach(guest => {
      handleAdmitGuest(guest.socketId);
    });
  };

  const handleKickParticipant = (targetSocketId) => {
    if (confirm('Are you sure you want to remove this participant?')) {
      socket.emit('host-kick', { roomId, targetSocketId });
    }
  };

  const handleEndMeeting = () => {
    if (confirm('Are you sure you want to end the meeting for all participants?')) {
      socket.emit('host-end-meeting', { roomId });
      localStorage.removeItem(`pm_host_token_${roomId}`);
      onLeave();
    }
  };

  const handleSendMessage = (text, targetRecipientId = 'everyone') => {
    socket.emit('chat-message', {
      roomId,
      message: text,
      targetSocketId: targetRecipientId
    });
  };

  // Toggle chat and reset unread badge and active toast
  const toggleChat = () => {
    setIsChatOpen(prev => {
      if (!prev) {
        setUnreadChatCount(0);
        setToastMessage(null);
      }
      return !prev;
    });
  };

  // If still in lobby / waiting room
  if (joinStatus !== 'admitted') {
    return (
      <Lobby
        roomId={roomId}
        userName={userName}
        setUserName={setUserName}
        onJoin={handleJoinRoom}
        joinStatus={joinStatus}
        joinError={joinError}
        isHostPreset={isHostPreset}
        onBackToHome={onLeave}
      />
    );
  }

  // Active Call View
  return (
    <div className="h-screen w-screen bg-meet-bg flex flex-col overflow-hidden select-none">
      {/* Host Admission Alert Modal */}
      {role === 'host' && (
        <WaitingRoomModal
          waitingList={waitingList}
          onAdmit={handleAdmitGuest}
          onReject={handleRejectGuest}
          onAdmitAll={handleAdmitAll}
        />
      )}

      {/* Dedicated Remote Audio Playback for macOS & Cross-Browser Stability */}
      <RemoteAudioRenderer remotePeers={remotePeers} selectedAudioOutput={selectedAudioOutput} />

      {/* Main Video Area with Optional Side Drawers */}
      <div className="flex-1 flex overflow-hidden relative">
        <VideoGrid
          localStream={localStream}
          localName={userName}
          localRole={role}
          isAudioMuted={isAudioMuted}
          isVideoMuted={isVideoMuted}
          isScreenSharing={isScreenSharing}
          screenStream={screenStream}
          remotePeers={remotePeers}
        />

        {/* Side Drawers */}
        <ParticipantsDrawer
          isOpen={isParticipantsOpen}
          onClose={() => setIsParticipantsOpen(false)}
          participants={participants}
          currentUserId={socket.id}
          isHost={role === 'host'}
          onKickParticipant={handleKickParticipant}
        />

        <ChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          currentUserId={socket.id}
          participants={participants}
        />
      </div>

      {/* On-Screen Floating Message Toast (Alerts when Chat is Closed) */}
      <ChatToast
        toastMessage={toastMessage}
        onOpenChat={() => {
          setIsChatOpen(true);
          setUnreadChatCount(0);
          setToastMessage(null);
        }}
        onDismiss={() => setToastMessage(null)}
      />

      {/* Bottom Floating Control Bar */}
      <ControlBar
        isAudioMuted={isAudioMuted}
        isVideoMuted={isVideoMuted}
        isScreenSharing={isScreenSharing}
        toggleAudio={toggleAudio}
        toggleVideo={toggleVideo}
        startScreenShare={startScreenShare}
        stopScreenShare={stopScreenShare}
        onLeaveCall={onLeave}
        participantCount={participants.length || 1}
        toggleParticipants={() => setIsParticipantsOpen(prev => !prev)}
        isParticipantsOpen={isParticipantsOpen}
        toggleChat={toggleChat}
        isChatOpen={isChatOpen}
        unreadChatCount={unreadChatCount}
        isHost={role === 'host'}
        onEndMeeting={handleEndMeeting}
        roomId={roomId}
        audioDevices={audioDevices}
        selectedAudioDevice={selectedAudioDevice}
        switchAudioDevice={switchAudioDevice}
        audioOutputDevices={audioOutputDevices}
        selectedAudioOutput={selectedAudioOutput}
        switchAudioOutput={switchAudioOutput}
        refreshAudioDevices={refreshAudioDevices}
      />
    </div>
  );
}
