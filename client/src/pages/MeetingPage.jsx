import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket } from '../services/socket.js';
import { useWebRTC } from '../hooks/useWebRTC.js';
import { Lobby } from '../components/Lobby.jsx';
import { VideoGrid } from '../components/VideoGrid.jsx';
import { ControlBar } from '../components/ControlBar.jsx';
import { WaitingRoomModal } from '../components/WaitingRoomModal.jsx';
import { ParticipantsDrawer } from '../components/ParticipantsDrawer.jsx';
import { ChatDrawer } from '../components/ChatDrawer.jsx';

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

  const socket = getSocket();

  // Host token stored in localStorage for this roomId (if user created it)
  const hostToken = localStorage.getItem(`pm_host_token_${roomId}`);
  const isHostPreset = Boolean(hostToken);

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
    initiateOffer
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

        // If newly admitted guest, connect to all existing participants
        if (response.participants) {
          response.participants.forEach(p => {
            if (p.socketId !== socket.id) {
              initiateOffer(p.socketId);
            }
          });
        }
      } else if (response.status === 'waiting') {
        setJoinStatus('waiting');
      } else if (response.status === 'waiting_host') {
        setJoinStatus('waiting_host');
      } else {
        setJoinStatus('idle');
        setJoinError(response.message || 'Could not join meeting.');
      }
    });
  }, [roomId, hostToken, isHostPreset, userName, socket, startLocalStream, initiateOffer]);

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

      // Connect with existing participants
      if (data.participants) {
        data.participants.forEach(p => {
          if (p.socketId !== socket.id) {
            initiateOffer(p.socketId);
          }
        });
      }
    };

    // Guest gets rejected by Host
    const handleJoinRejected = (data) => {
      setJoinStatus('rejected');
      setJoinError(data.reason || 'The host declined your request.');
    };

    // Host receives knocking guest
    const handleGuestKnock = ({ guest }) => {
      console.log('[Host Alert] Guest knock:', guest);
      setWaitingList(prev => {
        if (prev.some(g => g.socketId === guest.socketId)) return prev;
        return [...prev, guest];
      });
    };

    // Knocking guest leaves waiting room
    const handleGuestKnockCancelled = ({ socketId }) => {
      setWaitingList(prev => prev.filter(g => g.socketId !== socketId));
    };

    // New participant joined the room
    const handleUserJoined = ({ participant }) => {
      setParticipants(prev => {
        if (prev.some(p => p.socketId === participant.socketId)) return prev;
        return [...prev, participant];
      });
      // Remove from waiting list if they were there
      setWaitingList(prev => prev.filter(g => g.socketId !== participant.socketId));
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
      if (!isChatOpen) {
        setUnreadChatCount(prev => prev + 1);
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

  const handleSendMessage = (text) => {
    socket.emit('chat-message', { roomId, message: text });
  };

  // Toggle chat and reset unread badge
  const toggleChat = () => {
    setIsChatOpen(prev => {
      if (!prev) setUnreadChatCount(0);
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
        />
      </div>

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
      />
    </div>
  );
}
