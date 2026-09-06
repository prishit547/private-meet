import React, { useEffect, useRef, useState } from 'react';
import {
  MicOff,
  Crown,
  Monitor,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  PictureInPicture2,
  Scaling
} from 'lucide-react';
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
  isPinned = false,
  fitMode = 'contain', // 'contain' | 'cover'
  onToggleFit = null
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);

  // Active speaker detection
  const isSpeaking = useAudioLevel(stream, !isAudioMuted);

  // Bind media stream to HTML5 Video element
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(() => {});
    } else if (videoRef.current && !stream) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Synchronize fullscreen state with document events (handles Esc key automatically)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentFullscreen = document.fullscreenElement === containerRef.current;
      setIsFullscreen(isCurrentFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Listen to Picture-in-Picture events
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const handleEnterPip = () => setIsPipActive(true);
    const handleLeavePip = () => setIsPipActive(false);

    videoEl.addEventListener('enterpictureinpicture', handleEnterPip);
    videoEl.addEventListener('leavepictureinpicture', handleLeavePip);

    return () => {
      videoEl.removeEventListener('enterpictureinpicture', handleEnterPip);
      videoEl.removeEventListener('leavepictureinpicture', handleLeavePip);
    };
  }, []);

  const toggleFullscreen = (e) => {
    e?.stopPropagation();
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch((err) => {
        console.warn('Fullscreen request denied:', err);
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const togglePip = async (e) => {
    e?.stopPropagation();
    if (!videoRef.current) return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('Picture in Picture failed:', err);
    }
  };

  // Double click toggles fullscreen
  const handleDoubleClick = () => {
    toggleFullscreen();
  };

  // Initials for avatar fallback
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'U';

  const hasVideo = Boolean(
    stream &&
    stream.getVideoTracks().length > 0 &&
    stream.getVideoTracks().some((t) => t.readyState === 'live') &&
    !isVideoMuted
  );

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      className={`group relative w-full h-full min-h-[160px] bg-meet-surface rounded-2xl overflow-hidden flex items-center justify-center transition-all duration-200 border select-none ${
        isSpeaking && !isScreenTile
          ? 'border-meet-green ring-2 ring-meet-green/40 shadow-md shadow-meet-green/20'
          : isPinned
          ? 'border-meet-accent/60 ring-1 ring-meet-accent/30'
          : 'border-white/10'
      }`}
    >
      {/* Video Element (Muted so visual rendering never blocks or collides with dedicated audio) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
        className={`w-full h-full ${
          isScreenTile
            ? fitMode === 'cover'
              ? 'object-cover bg-black'
              : 'object-contain bg-black'
            : 'object-cover'
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

      {/* Top Left Badges: Screen Share Indicator & Pinned Badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
        {isScreenTile && (
          <div className="bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1.5 border border-white/15 shadow-sm">
            <Monitor className="w-3.5 h-3.5 text-meet-accent animate-pulse" />
            <span>{name}'s Screen</span>
          </div>
        )}

        {isPinned && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin && onPin();
            }}
            className="bg-meet-accent/90 hover:bg-meet-accent text-gray-950 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 shadow-md transition-all cursor-pointer"
            title="Click to unpin"
          >
            <Pin className="w-3 h-3 fill-current" />
            <span>Pinned</span>
          </button>
        )}
      </div>

      {/* Top Right Floating Action Controls (revealed on hover or focus) */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity bg-black/60 backdrop-blur-md rounded-xl p-1 border border-white/15 z-20 shadow-lg">
        {/* Toggle Fit / Fill (for screen shares) */}
        {isScreenTile && onToggleFit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFit();
            }}
            title={fitMode === 'contain' ? 'Zoom to fill window' : 'Fit entire screen in window'}
            className="p-1.5 rounded-lg hover:bg-white/20 text-gray-200 transition-colors"
          >
            <Scaling className="w-4 h-4" />
          </button>
        )}

        {/* Picture-in-Picture Button */}
        {hasVideo && document.pictureInPictureEnabled && (
          <button
            onClick={togglePip}
            title={isPipActive ? 'Exit Picture-in-Picture' : 'Open in Picture-in-Picture window'}
            className={`p-1.5 rounded-lg transition-colors ${
              isPipActive ? 'bg-meet-accent text-gray-950' : 'hover:bg-white/20 text-gray-200'
            }`}
          >
            <PictureInPicture2 className="w-4 h-4" />
          </button>
        )}

        {/* Pin / Unpin Button */}
        {onPin && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin();
            }}
            title={isPinned ? 'Unpin tile' : 'Pin tile to main stage'}
            className={`p-1.5 rounded-lg transition-colors ${
              isPinned ? 'bg-meet-accent text-gray-950' : 'hover:bg-white/20 text-gray-200'
            }`}
          >
            {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
          </button>
        )}

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen tile (Double click)'}
          className="p-1.5 rounded-lg hover:bg-white/20 text-gray-200 transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom Info Bar: Name & Mic Status */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-medium text-white flex items-center gap-1.5 border border-white/10 truncate max-w-[80%]">
          {role === 'host' && (
            <Crown className="w-3.5 h-3.5 text-meet-yellow flex-shrink-0" title="Host" />
          )}
          <span className="truncate">
            {name} {isLocal && '(You)'}
          </span>
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
