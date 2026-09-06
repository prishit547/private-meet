import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/socket.js';

export function useWebRTC(roomId, iceServers = []) {
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  // remoteStreams: Map of socketId -> { cameraStream, screenStream, mediaState }
  const [remotePeers, setRemotePeers] = useState(new Map());

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // References to keep state in callbacks
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const audioSendersRef = useRef(new Map());   // socketId -> RTCRtpSender (audio)
  const videoSendersRef = useRef(new Map());   // socketId -> RTCRtpSender (webcam)
  const screenSendersRef = useRef(new Map());   // socketId -> RTCRtpSender[] (screen share tracks)
  const iceCandidatesQueueRef = useRef(new Map()); // socketId -> RTCIceCandidate[]
  const remotePeersRef = useRef(new Map());

  const socket = getSocket();

  const rtcConfig = {
    iceServers: iceServers.length > 0
      ? iceServers
      : [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
  };

  // Helper to update remotePeers state
  const updateRemotePeer = useCallback((socketId, updater) => {
    setRemotePeers(prev => {
      const next = new Map(prev);
      const existing = next.get(socketId) || {
        socketId,
        stream: null,
        screenStream: null,
        mediaState: { audio: true, video: true, screen: false }
      };
      const updated = updater(existing);
      next.set(socketId, updated);
      remotePeersRef.current = next;
      return next;
    });
  }, []);

  const removeRemotePeer = useCallback((socketId) => {
    setRemotePeers(prev => {
      const next = new Map(prev);
      next.delete(socketId);
      remotePeersRef.current = next;
      return next;
    });
  }, []);

  // Initialize local webcam and mic (only activates hardware if requested)
  const startLocalStream = useCallback(async (audioInitial = true, videoInitial = true) => {
    try {
      if (localStreamRef.current) {
        return localStreamRef.current;
      }

      const stream = new MediaStream();
      localStreamRef.current = stream;

      // 1. Microphone Hardware
      if (audioInitial) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          });
          audioStream.getAudioTracks().forEach(track => {
            stream.addTrack(track);
          });
          setIsAudioMuted(false);
        } catch (err) {
          console.warn('Audio acquisition failed:', err);
          setIsAudioMuted(true);
        }
      } else {
        setIsAudioMuted(true);
      }

      // 2. Camera Hardware
      if (videoInitial) {
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            }
          });
          videoStream.getVideoTracks().forEach(track => {
            stream.addTrack(track);
          });
          setIsVideoMuted(false);
        } catch (err) {
          console.warn('Video acquisition failed:', err);
          setIsVideoMuted(true);
        }
      } else {
        setIsVideoMuted(true);
      }

      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('Failed to get any local media stream:', err);
      return null;
    }
  }, []);

  // Create RTCPeerConnection for a given peer
  const createPeerConnection = useCallback((peerSocketId) => {
    if (peerConnectionsRef.current.has(peerSocketId)) {
      return peerConnectionsRef.current.get(peerSocketId);
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current.set(peerSocketId, pc);
    iceCandidatesQueueRef.current.set(peerSocketId, []);

    // Add local tracks (webcam/mic) or initialize transceivers so tracks can be added later without renegotiation
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const sender = pc.addTrack(audioTrack, localStreamRef.current);
        audioSendersRef.current.set(peerSocketId, sender);
      } else {
        const transceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
        audioSendersRef.current.set(peerSocketId, transceiver.sender);
      }

      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc.addTrack(videoTrack, localStreamRef.current);
        videoSendersRef.current.set(peerSocketId, sender);
      } else {
        const transceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
        videoSendersRef.current.set(peerSocketId, transceiver.sender);
      }
    } else {
      const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      audioSendersRef.current.set(peerSocketId, audioTransceiver.sender);

      const videoTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
      videoSendersRef.current.set(peerSocketId, videoTransceiver.sender);
    }

    // Add screen tracks (video and audio) if currently sharing
    if (screenStreamRef.current) {
      const senders = [];
      screenStreamRef.current.getTracks().forEach(track => {
        const sender = pc.addTrack(track, screenStreamRef.current);
        senders.push(sender);
      });
      screenSendersRef.current.set(peerSocketId, senders);
    }

    // Send ICE candidates to remote peer via signaling server
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('signal-ice-candidate', {
          to: peerSocketId,
          candidate: event.candidate
        });
      }
    };

    // Handle incoming remote media tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const track = event.track;

      updateRemotePeer(peerSocketId, (peer) => {
        // If track belongs to a screen share stream (distinct ID or designated)
        if (peer.mediaState?.screen && peer.stream && remoteStream.id !== peer.stream.id) {
          return {
            ...peer,
            screenStream: remoteStream
          };
        }

        // Primary camera + audio stream
        if (!peer.stream) {
          return {
            ...peer,
            stream: remoteStream
          };
        } else {
          // Add track to existing stream if not present
          if (!peer.stream.getTracks().some(t => t.id === track.id)) {
            peer.stream.addTrack(track);
          }
          return { ...peer };
        }
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection with ${peerSocketId}:`, pc.connectionState);
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        closePeer(peerSocketId);
      }
    };

    return pc;
  }, [rtcConfig, socket, updateRemotePeer]);

  // Close peer connection cleanly
  const closePeer = useCallback((peerSocketId) => {
    const pc = peerConnectionsRef.current.get(peerSocketId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerSocketId);
    }
    audioSendersRef.current.delete(peerSocketId);
    videoSendersRef.current.delete(peerSocketId);
    screenSendersRef.current.delete(peerSocketId);
    iceCandidatesQueueRef.current.delete(peerSocketId);
    removeRemotePeer(peerSocketId);
  }, [removeRemotePeer]);

  // Initiate an Offer to a peer
  const initiateOffer = useCallback(async (peerSocketId) => {
    try {
      const pc = createPeerConnection(peerSocketId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('signal-offer', {
        to: peerSocketId,
        offer
      });
    } catch (err) {
      console.error(`Error creating offer to ${peerSocketId}:`, err);
    }
  }, [createPeerConnection, socket]);

  // Toggle Microphone (Completely turns off physical mic hardware when muted)
  const toggleAudio = useCallback(async () => {
    if (!isAudioMuted) {
      // 1. Turning OFF: Stop hardware audio track completely
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
          track.stop(); // Stops physical mic hardware
          localStreamRef.current.removeTrack(track);
        });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      // 2. Clear track on all peer connections
      audioSendersRef.current.forEach(sender => {
        try {
          sender.replaceTrack(null);
        } catch (e) {
          console.warn('Error clearing audio sender track:', e);
        }
      });

      setIsAudioMuted(true);

      socket.emit('media-state-change', {
        audio: false,
        video: !isVideoMuted,
        screen: isScreenSharing
      });
    } else {
      // Turning ON: Re-acquire microphone from browser
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        const newAudioTrack = stream.getAudioTracks()[0];
        if (newAudioTrack) {
          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream();
          }
          localStreamRef.current.addTrack(newAudioTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

          // Replace track on all existing peer connections
          peerConnectionsRef.current.forEach((pc, peerSocketId) => {
            const sender = audioSendersRef.current.get(peerSocketId);
            if (sender) {
              sender.replaceTrack(newAudioTrack);
            } else {
              const newSender = pc.addTrack(newAudioTrack, localStreamRef.current);
              audioSendersRef.current.set(peerSocketId, newSender);
              initiateOffer(peerSocketId);
            }
          });

          setIsAudioMuted(false);

          socket.emit('media-state-change', {
            audio: true,
            video: !isVideoMuted,
            screen: isScreenSharing
          });
        }
      } catch (err) {
        console.error('Failed to restart microphone:', err);
      }
    }
  }, [isAudioMuted, isVideoMuted, isScreenSharing, socket, initiateOffer]);

  // Toggle Camera (Completely turns off webcam sensor & green light when off)
  const toggleVideo = useCallback(async () => {
    if (!isVideoMuted) {
      // 1. Turning OFF: Stop hardware camera track completely
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.stop(); // Stops physical webcam hardware! Green LED turns OFF!
          localStreamRef.current.removeTrack(track);
        });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

      // 2. Clear track on all peer connections
      videoSendersRef.current.forEach(sender => {
        try {
          sender.replaceTrack(null);
        } catch (e) {
          console.warn('Error clearing video sender track:', e);
        }
      });

      setIsVideoMuted(true);

      socket.emit('media-state-change', {
        audio: !isAudioMuted,
        video: false,
        screen: isScreenSharing
      });
    } else {
      // Turning ON: Re-acquire camera from browser
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }
        });
        const newVideoTrack = stream.getVideoTracks()[0];
        if (newVideoTrack) {
          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream();
          }
          localStreamRef.current.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

          // Replace track on all existing peer connections
          peerConnectionsRef.current.forEach((pc, peerSocketId) => {
            const sender = videoSendersRef.current.get(peerSocketId);
            if (sender) {
              sender.replaceTrack(newVideoTrack);
            } else {
              const newSender = pc.addTrack(newVideoTrack, localStreamRef.current);
              videoSendersRef.current.set(peerSocketId, newSender);
              initiateOffer(peerSocketId);
            }
          });

          setIsVideoMuted(false);

          socket.emit('media-state-change', {
            audio: !isAudioMuted,
            video: true,
            screen: isScreenSharing
          });
        }
      } catch (err) {
        console.error('Failed to restart camera:', err);
      }
    }
  }, [isVideoMuted, isAudioMuted, isScreenSharing, socket, initiateOffer]);

  // Stop Screen Share
  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setIsScreenSharing(false);

      // Remove screen tracks from all active peer connections
      peerConnectionsRef.current.forEach((pc, peerSocketId) => {
        const senders = screenSendersRef.current.get(peerSocketId);
        if (senders && Array.isArray(senders)) {
          senders.forEach(sender => {
            try {
              pc.removeTrack(sender);
            } catch (e) {
              console.warn('Error removing screen track:', e);
            }
          });
          screenSendersRef.current.delete(peerSocketId);
        }
      });

      // Notify room
      socket.emit('media-state-change', {
        audio: !isAudioMuted,
        video: !isVideoMuted,
        screen: false
      });

      // Renegotiate with peers
      peerConnectionsRef.current.forEach((pc, peerSocketId) => {
        initiateOffer(peerSocketId);
      });
    }
  }, [isAudioMuted, isVideoMuted, socket, initiateOffer]);

  // Start Screen Share
  const startScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    try {
      // High-definition screen capture supporting up to 4K resolution at 60 FPS + system audio
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
          width: { ideal: 3840, max: 3840 },
          height: { ideal: 2160, max: 2160 },
          frameRate: { ideal: 60, max: 60 }
        },
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      const screenVideoTrack = displayStream.getVideoTracks()[0];
      if (screenVideoTrack) {
        // Optimize WebRTC encoder for sharp text/code details
        screenVideoTrack.contentHint = 'detail';

        // Native browser "Stop sharing" button hook
        screenVideoTrack.onended = () => {
          stopScreenShare();
        };
      }

      screenStreamRef.current = displayStream;
      setScreenStream(displayStream);
      setIsScreenSharing(true);

      // Add all tracks (video + system audio if present) to all existing peer connections
      peerConnectionsRef.current.forEach((pc, peerSocketId) => {
        try {
          const senders = [];
          displayStream.getTracks().forEach(track => {
            const sender = pc.addTrack(track, displayStream);
            senders.push(sender);
          });
          screenSendersRef.current.set(peerSocketId, senders);
        } catch (e) {
          console.error('Failed to add screen tracks to peer:', e);
        }
      });

      // Notify room that we are sharing screen
      socket.emit('media-state-change', {
        audio: !isAudioMuted,
        video: !isVideoMuted,
        screen: true
      });

      // Trigger renegotiation offer with all peers
      peerConnectionsRef.current.forEach((pc, peerSocketId) => {
        initiateOffer(peerSocketId);
      });
    } catch (err) {
      console.warn('Screen share canceled or failed:', err);
    }
  }, [isScreenSharing, stopScreenShare, socket, isAudioMuted, isVideoMuted, initiateOffer]);

  // Listen to Socket Signaling Events
  useEffect(() => {
    // 1. When a new peer joins the room, initiate connection offer
    const handleUserJoined = ({ participant }) => {
      if (participant.socketId === socket.id) return;
      console.log('[WebRTC] Participant joined:', participant.name, participant.socketId);

      updateRemotePeer(participant.socketId, (p) => ({
        ...p,
        name: participant.name,
        role: participant.role,
        mediaState: participant.mediaState || { audio: true, video: true, screen: false }
      }));

      // Initiate WebRTC offer to the new participant
      initiateOffer(participant.socketId);
    };

    // 2. Incoming Offer from peer
    const handleSignalOffer = async ({ from, offer }) => {
      console.log('[WebRTC] Received offer from:', from);
      try {
        const pc = createPeerConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Drain queued ICE candidates
        const queuedCandidates = iceCandidatesQueueRef.current.get(from) || [];
        for (const candidate of queuedCandidates) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        iceCandidatesQueueRef.current.set(from, []);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('signal-answer', {
          to: from,
          answer
        });
      } catch (err) {
        console.error(`Error processing offer from ${from}:`, err);
      }
    };

    // 3. Incoming Answer from peer
    const handleSignalAnswer = async ({ from, answer }) => {
      console.log('[WebRTC] Received answer from:', from);
      try {
        const pc = peerConnectionsRef.current.get(from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));

          // Drain queued ICE candidates
          const queuedCandidates = iceCandidatesQueueRef.current.get(from) || [];
          for (const candidate of queuedCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          iceCandidatesQueueRef.current.set(from, []);
        }
      } catch (err) {
        console.error(`Error setting answer from ${from}:`, err);
      }
    };

    // 4. Incoming ICE candidate
    const handleSignalIceCandidate = async ({ from, candidate }) => {
      const pc = peerConnectionsRef.current.get(from);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error(`Error adding ICE candidate from ${from}:`, err);
        }
      } else {
        // Queue until remote description is set
        const queue = iceCandidatesQueueRef.current.get(from) || [];
        queue.push(candidate);
        iceCandidatesQueueRef.current.set(from, queue);
      }
    };

    // 5. Peer updated media state (muted/cam/screen)
    const handlePeerMediaStateUpdated = ({ socketId, mediaState }) => {
      updateRemotePeer(socketId, (p) => ({
        ...p,
        mediaState: { ...p.mediaState, ...mediaState }
      }));
    };

    // 6. User left
    const handleUserLeft = ({ socketId }) => {
      console.log('[WebRTC] User left:', socketId);
      closePeer(socketId);
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('signal-offer', handleSignalOffer);
    socket.on('signal-answer', handleSignalAnswer);
    socket.on('signal-ice-candidate', handleSignalIceCandidate);
    socket.on('peer-media-state-updated', handlePeerMediaStateUpdated);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('signal-offer', handleSignalOffer);
      socket.off('signal-answer', handleSignalAnswer);
      socket.off('signal-ice-candidate', handleSignalIceCandidate);
      socket.off('peer-media-state-updated', handlePeerMediaStateUpdated);
      socket.off('user-left', handleUserLeft);
    };
  }, [socket, initiateOffer, createPeerConnection, updateRemotePeer, closePeer]);

  // Clean cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
      }
      peerConnectionsRef.current.forEach(pc => pc.close());
      peerConnectionsRef.current.clear();
      screenSendersRef.current.clear();
      iceCandidatesQueueRef.current.clear();
    };
  }, []);

  return {
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
    createPeerConnection,
    initiateOffer
  };
}
