import { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../services/socket.js';

export function useWebRTC(roomId, iceServers = []) {
  const [localStream, setLocalStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  // remotePeers: Map of socketId -> { socketId, name, role, stream, screenStream, mediaState }
  const [remotePeers, setRemotePeers] = useState(new Map());

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Audio device state (Microphone & Speaker output)
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState(() => {
    return localStorage.getItem('preferred_mic_id') || 'default';
  });
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState(() => {
    return localStorage.getItem('preferred_output_id') || 'default';
  });

  // References to keep state in callbacks
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const audioSendersRef = useRef(new Map());   // socketId -> RTCRtpSender (audio)
  const videoSendersRef = useRef(new Map());   // socketId -> RTCRtpSender (webcam)
  const screenSendersRef = useRef(new Map());   // socketId -> RTCRtpSender[] (screen share tracks)
  const iceCandidatesQueueRef = useRef(new Map()); // socketId -> RTCIceCandidate[]
  const remotePeersRef = useRef(new Map());
  const peerTracksMetaRef = useRef(new Map()); // socketId -> metadata about tracks (screen IDs, etc.)

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
    peerTracksMetaRef.current.delete(socketId);
  }, []);

  // Enumerate all available audio input and output devices
  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [] };
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      const inputs = devices
        .filter(d => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`
        }));
      setAudioDevices(inputs);

      const outputs = devices
        .filter(d => d.kind === 'audiooutput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${index + 1}`
        }));
      setAudioOutputDevices(outputs);

      return { inputs, outputs };
    } catch (err) {
      console.warn('Failed to enumerate audio devices:', err);
      return { inputs: [], outputs: [] };
    }
  }, []);

  // Listen to device changes (e.g. plugging in a USB mic or connecting AirPods)
  useEffect(() => {
    refreshAudioDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshAudioDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshAudioDevices);
      };
    }
  }, [refreshAudioDevices]);

  // Synchronize remote peer streams based on active RTCPeerConnection receivers
  const syncPeerStreams = useCallback((peerSocketId, mediaStateOverride = null, tracksMetaOverride = null) => {
    const pc = peerConnectionsRef.current.get(peerSocketId);
    if (!pc) return;

    if (tracksMetaOverride) {
      peerTracksMetaRef.current.set(peerSocketId, {
        ...(peerTracksMetaRef.current.get(peerSocketId) || {}),
        ...tracksMetaOverride
      });
    }

    const currentMeta = peerTracksMetaRef.current.get(peerSocketId) || {};

    updateRemotePeer(peerSocketId, (peer) => {
      const activeMediaState = {
        ...peer.mediaState,
        ...(mediaStateOverride || {})
      };

      const isScreenActive = Boolean(activeMediaState.screen);

      // Collect all active receivers from RTCPeerConnection
      const receivers = pc.getReceivers();
      const liveAudioTracks = [];
      const liveVideoTracks = [];

      receivers.forEach(receiver => {
        const track = receiver.track;
        if (track && track.readyState === 'live') {
          if (!track._syncListenerAttached) {
            track._syncListenerAttached = true;
            track.onended = () => {
              console.log(`[WebRTC] Track ended on peer ${peerSocketId}: ${track.kind} (${track.id})`);
              syncPeerStreams(peerSocketId);
            };
            track.onmute = () => {
              syncPeerStreams(peerSocketId);
            };
            track.onunmute = () => {
              syncPeerStreams(peerSocketId);
            };
          }

          if (track.kind === 'audio') {
            liveAudioTracks.push(track);
          } else if (track.kind === 'video') {
            liveVideoTracks.push(track);
          }
        }
      });

      // 1. Separate Video Tracks (Camera vs Screen Share)
      let cameraVideoTrack = null;
      let screenVideoTrack = null;

      if (liveVideoTracks.length === 1) {
        const singleTrack = liveVideoTracks[0];
        if (isScreenActive && !activeMediaState.video) {
          // Peer camera is OFF, but screen sharing is active
          screenVideoTrack = singleTrack;
        } else if (isScreenActive && activeMediaState.video) {
          // Both screen and video active: check metadata if available
          if (currentMeta.screenVideoTrackId && singleTrack.id === currentMeta.screenVideoTrackId) {
            screenVideoTrack = singleTrack;
          } else if (currentMeta.cameraVideoTrackId && singleTrack.id === currentMeta.cameraVideoTrackId) {
            cameraVideoTrack = singleTrack;
          } else if (peer.screenStream?.getVideoTracks().some(t => t.id === singleTrack.id)) {
            screenVideoTrack = singleTrack;
          } else {
            // New video track arriving while screen is marked active
            screenVideoTrack = singleTrack;
          }
        } else {
          // Screen share is OFF: single track belongs to webcam
          cameraVideoTrack = singleTrack;
        }
      } else if (liveVideoTracks.length >= 2) {
        // 2 or more video tracks: One is webcam, one is screen share
        if (currentMeta.screenVideoTrackId) {
          screenVideoTrack = liveVideoTracks.find(t => t.id === currentMeta.screenVideoTrackId);
          cameraVideoTrack = liveVideoTracks.find(t => t.id !== currentMeta.screenVideoTrackId);
        } else if (currentMeta.cameraVideoTrackId) {
          cameraVideoTrack = liveVideoTracks.find(t => t.id === currentMeta.cameraVideoTrackId);
          screenVideoTrack = liveVideoTracks.find(t => t.id !== currentMeta.cameraVideoTrackId);
        }

        // Fallback: transceiver 0 is camera, transceiver 1 is screen
        if (!cameraVideoTrack || !screenVideoTrack) {
          cameraVideoTrack = liveVideoTracks[0];
          screenVideoTrack = liveVideoTracks[1];
        }
      }

      // 2. Separate Audio Tracks (Microphone vs Screen Audio)
      let micAudioTrack = null;
      let screenAudioTrack = null;

      if (liveAudioTracks.length === 1) {
        micAudioTrack = liveAudioTracks[0];
      } else if (liveAudioTracks.length >= 2) {
        if (currentMeta.screenAudioTrackId) {
          screenAudioTrack = liveAudioTracks.find(t => t.id === currentMeta.screenAudioTrackId);
          micAudioTrack = liveAudioTracks.find(t => t.id !== currentMeta.screenAudioTrackId);
        }
        if (!micAudioTrack) {
          micAudioTrack = liveAudioTracks[0];
          screenAudioTrack = liveAudioTracks[1];
        }
      }

      // 3. Build Primary MediaStream (Webcam & Microphone)
      const primaryTracks = [];
      if (micAudioTrack) primaryTracks.push(micAudioTrack);
      if (cameraVideoTrack && activeMediaState.video) primaryTracks.push(cameraVideoTrack);
      const newPrimaryStream = primaryTracks.length > 0 ? new MediaStream(primaryTracks) : null;

      // 4. Build Screen Share MediaStream
      let newScreenStream = null;
      if (isScreenActive) {
        const screenTracks = [];
        if (screenVideoTrack) screenTracks.push(screenVideoTrack);
        if (screenAudioTrack) screenTracks.push(screenAudioTrack);
        if (screenTracks.length > 0) {
          newScreenStream = new MediaStream(screenTracks);
        }
      }

      return {
        ...peer,
        mediaState: activeMediaState,
        stream: newPrimaryStream,
        screenStream: newScreenStream
      };
    });
  }, [updateRemotePeer]);

  // Initialize local webcam and mic
  const startLocalStream = useCallback(async (audioInitial = true, videoInitial = true) => {
    try {
      if (localStreamRef.current) {
        return localStreamRef.current;
      }

      const stream = new MediaStream();
      localStreamRef.current = stream;

      const preferredMicId = localStorage.getItem('preferred_mic_id') || selectedAudioDevice;

      // 1. Microphone Hardware
      if (audioInitial) {
        let audioStream = null;
        const micConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(preferredMicId && preferredMicId !== 'default'
            ? { deviceId: { ideal: preferredMicId } }
            : {})
        };

        try {
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints });
        } catch (micErr) {
          console.warn('Advanced audio constraints failed, falling back to basic audio:', micErr);
          try {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (fallbackErr) {
            console.error('Microphone access completely denied or unavailable:', fallbackErr);
          }
        }

        if (audioStream) {
          audioStream.getAudioTracks().forEach(track => {
            track.enabled = true;
            stream.addTrack(track);
          });
          setIsAudioMuted(false);
          refreshAudioDevices();
        } else {
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
            track.enabled = true;
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

      // Attach newly acquired tracks to any peer connections that already exist
      const audioTrack = stream.getAudioTracks()[0];
      const videoTrack = stream.getVideoTracks()[0];

      peerConnectionsRef.current.forEach((pc, peerSocketId) => {
        if (audioTrack) {
          const sender = audioSendersRef.current.get(peerSocketId);
          if (sender) {
            try {
              sender.replaceTrack(audioTrack);
            } catch (e) {
              console.warn(`[WebRTC] replaceTrack audio error for ${peerSocketId}:`, e);
            }
          } else {
            const newSender = pc.addTrack(audioTrack, stream);
            audioSendersRef.current.set(peerSocketId, newSender);
          }
        }
        if (videoTrack) {
          const sender = videoSendersRef.current.get(peerSocketId);
          if (sender) {
            try {
              sender.replaceTrack(videoTrack);
            } catch (e) {
              console.warn(`[WebRTC] replaceTrack video error for ${peerSocketId}:`, e);
            }
          } else {
            const newSender = pc.addTrack(videoTrack, stream);
            videoSendersRef.current.set(peerSocketId, newSender);
          }
        }
      });

      return stream;
    } catch (err) {
      console.error('Failed to get any local media stream:', err);
      return null;
    }
  }, [selectedAudioDevice, refreshAudioDevices]);

  // Switch microphone input device in real-time
  const switchAudioDevice = useCallback(async (newDeviceId) => {
    console.log('[WebRTC] Switching microphone input device to:', newDeviceId);
    setSelectedAudioDevice(newDeviceId);
    localStorage.setItem('preferred_mic_id', newDeviceId);

    if (!isAudioMuted && localStreamRef.current) {
      try {
        let newStream = null;
        const constraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(newDeviceId && newDeviceId !== 'default'
            ? { deviceId: { exact: newDeviceId } }
            : {})
        };

        try {
          newStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        } catch (e) {
          newStream = await navigator.mediaDevices.getUserMedia({
            audio: newDeviceId && newDeviceId !== 'default' ? { deviceId: newDeviceId } : true
          });
        }

        const newAudioTrack = newStream.getAudioTracks()[0];
        if (!newAudioTrack) return;
        newAudioTrack.enabled = true;

        // Stop old audio hardware tracks
        localStreamRef.current.getAudioTracks().forEach(oldTrack => {
          oldTrack.stop();
          localStreamRef.current.removeTrack(oldTrack);
        });

        // Add new track to local stream
        localStreamRef.current.addTrack(newAudioTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

        // Hot-swap on all active peer connections
        peerConnectionsRef.current.forEach((pc, peerSocketId) => {
          const sender = audioSendersRef.current.get(peerSocketId);
          if (sender) {
            sender.replaceTrack(newAudioTrack).catch(err => {
              console.warn(`[WebRTC] Failed to replace track for peer ${peerSocketId}:`, err);
            });
          } else {
            const newSender = pc.addTrack(newAudioTrack, localStreamRef.current);
            audioSendersRef.current.set(peerSocketId, newSender);
            initiateOffer(peerSocketId);
          }
        });
      } catch (err) {
        console.error('[WebRTC] Error switching microphone device:', err);
      }
    }
  }, [isAudioMuted]);

  // Switch audio output device (speaker)
  const switchAudioOutput = useCallback((newOutputDeviceId) => {
    console.log('[WebRTC] Setting audio output device:', newOutputDeviceId);
    setSelectedAudioOutput(newOutputDeviceId);
    localStorage.setItem('preferred_output_id', newOutputDeviceId);
  }, []);

  // Create RTCPeerConnection for a given peer
  const createPeerConnection = useCallback((peerSocketId) => {
    if (peerConnectionsRef.current.has(peerSocketId)) {
      return peerConnectionsRef.current.get(peerSocketId);
    }

    const pc = new RTCPeerConnection(rtcConfig);
    peerConnectionsRef.current.set(peerSocketId, pc);
    iceCandidatesQueueRef.current.set(peerSocketId, []);

    // Add local tracks (webcam/mic) or initialize transceivers
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

    // Handle incoming remote media tracks directly with syncPeerStreams
    pc.ontrack = (event) => {
      console.log(`[WebRTC] ontrack from ${peerSocketId}: kind=${event.track.kind}, id=${event.track.id}`);
      syncPeerStreams(peerSocketId);
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection with ${peerSocketId}:`, pc.connectionState);
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        closePeer(peerSocketId);
      }
    };

    return pc;
  }, [rtcConfig, socket, syncPeerStreams]);

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
  const initiateOffer = useCallback(async (peerSocketId, customTracksMeta = null) => {
    try {
      const pc = createPeerConnection(peerSocketId);

      // Ensure any existing local tracks are attached before creating offer
      if (localStreamRef.current) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          const sender = audioSendersRef.current.get(peerSocketId);
          if (sender && sender.track !== audioTrack) {
            await sender.replaceTrack(audioTrack).catch(() => {});
          }
        }
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          const sender = videoSendersRef.current.get(peerSocketId);
          if (sender && sender.track !== videoTrack) {
            await sender.replaceTrack(videoTrack).catch(() => {});
          }
        }
      }

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const tracksMeta = customTracksMeta || {
        screenStreamId: screenStreamRef.current ? screenStreamRef.current.id : null,
        screenVideoTrackId: screenStreamRef.current?.getVideoTracks()[0]?.id || null,
        screenAudioTrackId: screenStreamRef.current?.getAudioTracks()[0]?.id || null,
        cameraStreamId: localStreamRef.current ? localStreamRef.current.id : null,
        cameraVideoTrackId: localStreamRef.current?.getVideoTracks()[0]?.id || null,
        micAudioTrackId: localStreamRef.current?.getAudioTracks()[0]?.id || null
      };

      socket.emit('signal-offer', {
        to: peerSocketId,
        offer,
        tracksMeta
      });
    } catch (err) {
      console.error(`Error creating offer to ${peerSocketId}:`, err);
    }
  }, [createPeerConnection, socket]);

  // Toggle Microphone
  const toggleAudio = useCallback(async () => {
    if (!isAudioMuted) {
      // 1. Turning OFF: Stop hardware audio track completely
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(track => {
          track.stop();
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
      // Turning ON: Re-acquire microphone from browser using preferred device
      try {
        let stream = null;
        const preferredMicId = localStorage.getItem('preferred_mic_id') || selectedAudioDevice;
        const constraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(preferredMicId && preferredMicId !== 'default'
            ? { deviceId: { ideal: preferredMicId } }
            : {})
        };

        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
        } catch (micErr) {
          console.warn('Advanced audio constraints failed on toggle, falling back to default:', micErr);
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }

        const newAudioTrack = stream.getAudioTracks()[0];
        if (newAudioTrack) {
          newAudioTrack.enabled = true;
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
  }, [isAudioMuted, isVideoMuted, isScreenSharing, socket, initiateOffer, selectedAudioDevice]);

  // Toggle Camera
  const toggleVideo = useCallback(async () => {
    if (!isVideoMuted) {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.stop();
          localStreamRef.current.removeTrack(track);
        });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }

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
          newVideoTrack.enabled = true;
          if (!localStreamRef.current) {
            localStreamRef.current = new MediaStream();
          }
          localStreamRef.current.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));

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
        screen: false,
        tracksMeta: {
          screenStreamId: null,
          screenVideoTrackId: null,
          screenAudioTrackId: null
        }
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
        screenVideoTrack.contentHint = 'detail';
        screenVideoTrack.onended = () => {
          stopScreenShare();
        };
      }

      screenStreamRef.current = displayStream;
      setScreenStream(displayStream);
      setIsScreenSharing(true);

      // Add tracks to all peer connections
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

      const tracksMeta = {
        screenStreamId: displayStream.id,
        screenVideoTrackId: screenVideoTrack ? screenVideoTrack.id : null,
        screenAudioTrackId: displayStream.getAudioTracks()[0]?.id || null,
        cameraStreamId: localStreamRef.current ? localStreamRef.current.id : null,
        cameraVideoTrackId: localStreamRef.current?.getVideoTracks()[0]?.id || null,
        micAudioTrackId: localStreamRef.current?.getAudioTracks()[0]?.id || null
      };

      // Notify room
      socket.emit('media-state-change', {
        audio: !isAudioMuted,
        video: !isVideoMuted,
        screen: true,
        tracksMeta
      });

      // Trigger renegotiation offer with all peers
      peerConnectionsRef.current.forEach((pc, peerSocketId) => {
        initiateOffer(peerSocketId, tracksMeta);
      });
    } catch (err) {
      console.warn('Screen share canceled or failed:', err);
    }
  }, [isScreenSharing, stopScreenShare, socket, isAudioMuted, isVideoMuted, initiateOffer]);

  // Listen to Socket Signaling Events
  useEffect(() => {
    // 1. Participant joined
    const handleUserJoined = ({ participant }) => {
      if (participant.socketId === socket.id) return;
      console.log('[WebRTC] Participant joined:', participant.name, participant.socketId);

      updateRemotePeer(participant.socketId, (p) => ({
        ...p,
        name: participant.name,
        role: participant.role,
        mediaState: participant.mediaState || { audio: true, video: true, screen: false }
      }));

      initiateOffer(participant.socketId);
    };

    // 2. Incoming Offer
    const handleSignalOffer = async ({ from, offer, tracksMeta }) => {
      console.log('[WebRTC] Received offer from:', from);
      try {
        const pc = createPeerConnection(from);

        // Perfect Negotiation: Glare collision resolution
        const isCollision = pc.signalingState !== 'stable';
        if (isCollision) {
          const isPolite = socket.id < from;
          console.log(`[WebRTC] Offer collision with ${from}. isPolite: ${isPolite}, state: ${pc.signalingState}`);
          if (!isPolite) {
            console.log(`[WebRTC] Impolite peer: ignoring incoming offer from ${from}`);
            return;
          }
          console.log(`[WebRTC] Polite peer: rolling back local description for ${from}`);
          await pc.setLocalDescription({ type: 'rollback' });
        }

        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          if (audioTrack) {
            const sender = audioSendersRef.current.get(from);
            if (sender && sender.track !== audioTrack) {
              await sender.replaceTrack(audioTrack).catch(() => {});
            }
          }
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            const sender = videoSendersRef.current.get(from);
            if (sender && sender.track !== videoTrack) {
              await sender.replaceTrack(videoTrack).catch(() => {});
            }
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Drain queued ICE candidates
        const queuedCandidates = iceCandidatesQueueRef.current.get(from) || [];
        for (const candidate of queuedCandidates) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn(`[WebRTC] Failed to add queued ICE candidate from ${from}:`, e);
          }
        }
        iceCandidatesQueueRef.current.set(from, []);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('signal-answer', {
          to: from,
          answer,
          tracksMeta: {
            screenStreamId: screenStreamRef.current ? screenStreamRef.current.id : null,
            screenVideoTrackId: screenStreamRef.current?.getVideoTracks()[0]?.id || null,
            screenAudioTrackId: screenStreamRef.current?.getAudioTracks()[0]?.id || null,
            cameraStreamId: localStreamRef.current ? localStreamRef.current.id : null,
            cameraVideoTrackId: localStreamRef.current?.getVideoTracks()[0]?.id || null,
            micAudioTrackId: localStreamRef.current?.getAudioTracks()[0]?.id || null
          }
        });

        // Re-synchronize peer streams immediately upon receiving offer
        syncPeerStreams(from, null, tracksMeta);
      } catch (err) {
        console.error(`Error processing offer from ${from}:`, err);
      }
    };

    // 3. Incoming Answer
    const handleSignalAnswer = async ({ from, answer, tracksMeta }) => {
      console.log('[WebRTC] Received answer from:', from);
      try {
        const pc = peerConnectionsRef.current.get(from);
        if (pc) {
          if (pc.signalingState !== 'have-local-offer') {
            console.warn(`[WebRTC] Ignoring answer from ${from} because state is ${pc.signalingState}`);
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(answer));

          const queuedCandidates = iceCandidatesQueueRef.current.get(from) || [];
          for (const candidate of queuedCandidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn(`[WebRTC] Failed to add queued ICE candidate from ${from}:`, e);
            }
          }
          iceCandidatesQueueRef.current.set(from, []);

          // Re-synchronize peer streams immediately upon receiving answer
          syncPeerStreams(from, null, tracksMeta);
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
        const queue = iceCandidatesQueueRef.current.get(from) || [];
        queue.push(candidate);
        iceCandidatesQueueRef.current.set(from, queue);
      }
    };

    // 5. Peer updated media state (muted/cam/screen)
    const handlePeerMediaStateUpdated = ({ socketId, mediaState }) => {
      syncPeerStreams(socketId, mediaState, mediaState?.tracksMeta);
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
  }, [socket, initiateOffer, createPeerConnection, updateRemotePeer, closePeer, syncPeerStreams]);

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
    initiateOffer,
    audioDevices,
    selectedAudioDevice,
    switchAudioDevice,
    audioOutputDevices,
    selectedAudioOutput,
    switchAudioOutput,
    refreshAudioDevices
  };
}
