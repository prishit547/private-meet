import React, { useEffect, useRef } from 'react';

/**
 * Individual remote audio track player with macOS Safari/Chrome autoplay handling and sinkId output routing
 */
function RemoteAudioTrack({ stream, label, isMuted, selectedAudioOutput }) {
  const audioRef = useRef(null);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !stream) return;

    audioEl.srcObject = stream;
    audioEl.volume = 1.0;

    const playAudio = () => {
      const p = audioEl.play();
      if (p !== undefined) {
        p.catch((err) => {
          console.warn(`[Audio] Autoplay waiting for user gesture for ${label}:`, err);
        });
      }
    };

    playAudio();

    // Unlock on user gesture (macOS Safari & Chrome requirement)
    const unlockGesture = () => {
      if (audioEl && audioEl.paused) {
        audioEl.play().catch(() => {});
      }
    };

    window.addEventListener('click', unlockGesture, { once: true });
    window.addEventListener('keydown', unlockGesture, { once: true });
    window.addEventListener('touchstart', unlockGesture, { once: true });

    return () => {
      window.removeEventListener('click', unlockGesture);
      window.removeEventListener('keydown', unlockGesture);
      window.removeEventListener('touchstart', unlockGesture);
    };
  }, [stream, label]);

  // Synchronize muted state with peer's microphone state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  // Direct audio output to selected speaker device if supported by browser
  useEffect(() => {
    if (audioRef.current && selectedAudioOutput && typeof audioRef.current.setSinkId === 'function') {
      if (selectedAudioOutput !== 'default') {
        audioRef.current.setSinkId(selectedAudioOutput).catch(err => {
          console.warn('[Audio] Failed to set sink ID:', err);
        });
      }
    }
  }, [selectedAudioOutput]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      style={{
        position: 'fixed',
        top: -9999,
        left: -9999,
        width: '1px',
        height: '1px',
        opacity: 0.001,
        pointerEvents: 'none'
      }}
    />
  );
}

/**
 * Top-level Audio Renderer for all remote peers.
 * Stays mounted in MeetingPage regardless of grid layouts, spotlighting, or cinema mode.
 */
export function RemoteAudioRenderer({ remotePeers, selectedAudioOutput = 'default' }) {
  if (!remotePeers || remotePeers.size === 0) return null;

  const audioTracks = [];

  remotePeers.forEach((peer, socketId) => {
    // 1. Peer Microphone Audio
    if (peer.stream) {
      const isMuted = peer.mediaState?.audio === false;
      audioTracks.push(
        <RemoteAudioTrack
          key={`audio-${socketId}`}
          stream={peer.stream}
          label={peer.name || socketId}
          isMuted={isMuted}
          selectedAudioOutput={selectedAudioOutput}
        />
      );
    }

    // 2. Peer Screen Share Audio (if sharing system audio)
    if (peer.screenStream) {
      audioTracks.push(
        <RemoteAudioTrack
          key={`screen-audio-${socketId}`}
          stream={peer.screenStream}
          label={`${peer.name || socketId} (Screen)`}
          isMuted={false}
          selectedAudioOutput={selectedAudioOutput}
        />
      );
    }
  });

  return <div className="sr-only" aria-hidden="true">{audioTracks}</div>;
}
