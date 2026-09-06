import React, { useEffect, useRef, useState } from 'react';
import { MicOff, Crown, Monitor, Maximize2, Minimize2 } from 'lucide-react';
import { useAudioLevel } from '../hooks/useAudioLevel.js';

export function VideoTile({
  stream,
  name = 'Participant',
  isLocal = false,
  isAudioMuted = false,
  isVideoMuted = false,
  isScreenTile = false,
  role = 'guest',
  onPin = null,
  isPinned = false
}) {
  const videoRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Active speaker detection using custom hook
  const isSpeaking = useAudioLevel(stream, !isAudioMuted);

  // Bind media stream to HTML5 Video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Generate initials for avatar fallback
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'U';

  const hasVideo = stream && stream.getVideoTracks().length > 0 && !isVideoMuted;

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[160px] bg-meet-surface rounded-2xl overflow-hidden flex items-center justify-center transition-all duration-200 border ${
        isSpeaking && !isScreenTile
          ? 'border-meet-green ring-2 ring-meet-green/40 shadow-md shadow-meet-green/20'
          : 'border-white/10'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Always mute local video so user doesn't hear own echo
        className={`w-full h-full ${
          isScreenTile ? 'object-contain bg-black' : 'object-cover'
        } ${isLocal && !isScreenTile ? 'mirror-video' : ''} ${
          hasVideo ? 'block' : 'hidden'
        }`}
      />

      {/* Avatar Fallback when camera is disabled */}
      {!hasVideo && (
        <div className="flex flex-col items-center justify-center select-none">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white text-2xl sm:text-3xl font-bold shadow-lg shadow-black/40">
            {initials}
          </div>
          <span className="mt-3 text-sm font-medium text-gray-300">{name}</span>
        </div>
      )}

      {/* Top Left Badges: Screen Share Indicator */}
      {isScreenTile && (
        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1.5 border border-white/10">
          <Monitor className="w-3.5 h-3.5 text-meet-accent" />
          <span>{name}'s Presentation</span>
        </div>
      )}

      {/* Top Right Action: Pin / Fullscreen */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity bg-black/40 backdrop-blur-md rounded-lg p-1 border border-white/10">
        {onPin && (
          <button
            onClick={onPin}
            title={isPinned ? "Unpin tile" : "Pin tile to center"}
            className="p-1.5 rounded hover:bg-white/20 text-gray-200"
          >
            <span className="text-xs">{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
        )}
        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen"
          className="p-1.5 rounded hover:bg-white/20 text-gray-200"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom Info Bar: Name & Mic Status */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1.5 border border-white/10 truncate max-w-[80%]">
          {role === 'host' && (
            <Crown className="w-3.5 h-3.5 text-meet-yellow flex-shrink-0" title="Host" />
          )}
          <span className="truncate">{name} {isLocal && '(You)'}</span>
        </div>

        {/* Mute indicator */}
        {isAudioMuted && !isScreenTile && (
          <div className="bg-meet-danger/90 p-1.5 rounded-full text-white shadow-sm flex-shrink-0">
            <MicOff className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}
