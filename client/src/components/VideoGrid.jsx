import React, { useState, useEffect } from 'react';
import {
  LayoutGrid,
  Tv,
  Maximize2,
  Eye,
  EyeOff,
  Scaling,
  Pin,
  PinOff
} from 'lucide-react';
import { VideoTile } from './VideoTile.jsx';

export function VideoGrid({
  localStream,
  localName,
  localRole,
  isAudioMuted,
  isVideoMuted,
  isScreenSharing,
  screenStream,
  remotePeers
}) {
  const [pinnedTileId, setPinnedTileId] = useState(null);
  const [isCinemaMode, setIsCinemaMode] = useState(false); // Hide side filmstrip to maximize presentation
  const [fitMode, setFitMode] = useState('contain'); // 'contain' | 'cover'
  const [forcedLayout, setForcedLayout] = useState('auto'); // 'auto' | 'grid' | 'spotlight'

  // Collect all available video tiles
  const tiles = [];

  // 1. Local screen share tile
  if (isScreenSharing && screenStream) {
    tiles.push({
      id: 'local-screen',
      stream: screenStream,
      name: localName,
      isLocal: true,
      isAudioMuted: false,
      isVideoMuted: false,
      isScreenTile: true,
      role: localRole
    });
  }

  // 2. Local camera tile
  tiles.push({
    id: 'local-camera',
    stream: localStream,
    name: localName,
    isLocal: true,
    isAudioMuted,
    isVideoMuted,
    isScreenTile: false,
    role: localRole
  });

  // 3. Remote peer tiles
  remotePeers.forEach((peer, socketId) => {
    // Remote screen tile (if peer is sharing screen)
    if (peer.mediaState?.screen && peer.screenStream) {
      tiles.push({
        id: `remote-${socketId}-screen`,
        stream: peer.screenStream,
        name: peer.name || 'Guest',
        isLocal: false,
        isAudioMuted: false,
        isVideoMuted: false,
        isScreenTile: true,
        role: peer.role || 'guest'
      });
    }

    // Remote camera tile
    tiles.push({
      id: `remote-${socketId}-camera`,
      stream: peer.stream,
      name: peer.name || 'Guest',
      isLocal: false,
      isAudioMuted: !peer.mediaState?.audio,
      isVideoMuted: !peer.mediaState?.video,
      isScreenTile: false,
      role: peer.role || 'guest'
    });
  });

  // Determine active spotlight tile:
  // Priority: 1. User pinned tile -> 2. Screen share tile (if not forced to grid)
  const activeScreenTile = tiles.find((t) => t.isScreenTile);
  let effectiveSpotlightId = null;

  if (forcedLayout === 'grid') {
    effectiveSpotlightId = null;
  } else if (pinnedTileId && tiles.some((t) => t.id === pinnedTileId)) {
    effectiveSpotlightId = pinnedTileId;
  } else if (activeScreenTile) {
    effectiveSpotlightId = activeScreenTile.id;
  } else if (forcedLayout === 'spotlight' && tiles.length > 0) {
    effectiveSpotlightId = tiles[0].id;
  }

  const spotlightTile = effectiveSpotlightId
    ? tiles.find((t) => t.id === effectiveSpotlightId)
    : null;
  const secondaryTiles = spotlightTile
    ? tiles.filter((t) => t.id !== spotlightTile.id)
    : tiles;

  // Toggle pinning on a tile
  const handleTogglePin = (tileId) => {
    if (pinnedTileId === tileId) {
      setPinnedTileId(null);
    } else {
      setPinnedTileId(tileId);
      setForcedLayout('auto');
    }
  };

  // Keyboard shortcut listener: 'F' for fullscreen, 'P' for pin toggle
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input / textarea
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;

      if (e.key === 'f' || e.key === 'F') {
        // Toggle fullscreen of spotlight or container
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {});
        } else {
          document.exitFullscreen?.().catch(() => {});
        }
      } else if (e.key === 'p' || e.key === 'P') {
        if (activeScreenTile) {
          handleTogglePin(activeScreenTile.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeScreenTile, pinnedTileId]);

  // Responsive Grid CSS class calculator
  const getGridClass = (count) => {
    if (count <= 1) return 'grid-cols-1 max-w-4xl max-h-[85vh]';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 max-w-5xl';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-7xl';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-7xl';
  };

  return (
    <div className="relative w-full h-full flex-1 p-2 sm:p-4 overflow-hidden flex flex-col items-center justify-center">
      {/* Top Presentation Toolbar (visible when a tile is spotlighted) */}
      {spotlightTile && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/15 text-xs text-gray-200 shadow-xl transition-all">
          <span className="font-semibold text-white truncate max-w-[160px] sm:max-w-xs">
            {spotlightTile.isScreenTile ? `🖥️ ${spotlightTile.name}'s Screen` : `📌 ${spotlightTile.name}`}
          </span>

          <span className="w-1 h-1 bg-gray-500 rounded-full mx-0.5" />

          {/* Focus / Cinema Mode: Hides filmstrip */}
          {secondaryTiles.length > 0 && (
            <button
              onClick={() => setIsCinemaMode((prev) => !prev)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                isCinemaMode ? 'bg-meet-accent text-gray-950 font-semibold' : 'hover:bg-white/10 text-gray-300'
              }`}
              title={isCinemaMode ? 'Show participants filmstrip' : 'Focus Mode: Hide participants strip'}
            >
              {isCinemaMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isCinemaMode ? 'Focused' : 'Focus'}</span>
            </button>
          )}

          {/* Scaling / Fit Toggle (for screen share) */}
          {spotlightTile.isScreenTile && (
            <button
              onClick={() => setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'))}
              className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/10 text-gray-300 transition-colors"
              title={fitMode === 'contain' ? 'Zoom to fill window' : 'Fit entire screen in view'}
            >
              <Scaling className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{fitMode === 'contain' ? 'Fit' : 'Fill'}</span>
            </button>
          )}

          {/* Switch to Grid View */}
          <button
            onClick={() => {
              setPinnedTileId(null);
              setForcedLayout(forcedLayout === 'grid' ? 'auto' : 'grid');
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/10 text-gray-300 transition-colors"
            title="Switch to equal grid view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Grid</span>
          </button>
        </div>
      )}

      {/* Floating Layout Selector (when in grid mode) */}
      {!spotlightTile && tiles.length > 1 && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-1 bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/10 text-xs">
          <button
            onClick={() => setForcedLayout('auto')}
            className={`p-1.5 rounded-lg transition-colors ${
              forcedLayout !== 'grid' ? 'bg-meet-accent text-gray-950' : 'text-gray-300 hover:bg-white/10'
            }`}
            title="Auto Spotlight View"
          >
            <Tv className="w-4 h-4" />
          </button>
          <button
            onClick={() => setForcedLayout('grid')}
            className={`p-1.5 rounded-lg transition-colors ${
              forcedLayout === 'grid' ? 'bg-meet-accent text-gray-950' : 'text-gray-300 hover:bg-white/10'
            }`}
            title="Equal Grid View"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Spotlight / Presentation Mode */}
      {spotlightTile ? (
        <div className="w-full h-full flex flex-col lg:flex-row gap-3 items-center justify-center pt-8 sm:pt-10">
          {/* Main Stage / Spotlight */}
          <div
            className={`w-full h-full flex items-center justify-center transition-all duration-300 ${
              isCinemaMode || secondaryTiles.length === 0
                ? 'flex-1 max-w-full'
                : 'lg:flex-1 h-[65vh] lg:h-full'
            }`}
          >
            <VideoTile
              key={spotlightTile.id}
              stream={spotlightTile.stream}
              name={spotlightTile.name}
              isLocal={spotlightTile.isLocal}
              isAudioMuted={spotlightTile.isAudioMuted}
              isVideoMuted={spotlightTile.isVideoMuted}
              isScreenTile={spotlightTile.isScreenTile}
              role={spotlightTile.role}
              onPin={() => handleTogglePin(spotlightTile.id)}
              isPinned={pinnedTileId === spotlightTile.id}
              fitMode={fitMode}
              onToggleFit={() => setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'))}
            />
          </div>

          {/* Secondary Participant Filmstrip (collapsible with Focus mode) */}
          {!isCinemaMode && secondaryTiles.length > 0 && (
            <div className="w-full lg:w-72 xl:w-80 flex lg:flex-col flex-row gap-3 overflow-x-auto lg:overflow-y-auto max-h-[22vh] lg:max-h-full flex-shrink-0 p-1">
              {secondaryTiles.map((tile) => (
                <div key={tile.id} className="w-44 sm:w-52 lg:w-full h-28 lg:h-40 flex-shrink-0">
                  <VideoTile
                    stream={tile.stream}
                    name={tile.name}
                    isLocal={tile.isLocal}
                    isAudioMuted={tile.isAudioMuted}
                    isVideoMuted={tile.isVideoMuted}
                    isScreenTile={tile.isScreenTile}
                    role={tile.role}
                    onPin={() => handleTogglePin(tile.id)}
                    isPinned={pinnedTileId === tile.id}
                    fitMode="cover"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* 2. Standard Responsive Grid Mode */
        <div
          className={`grid gap-3 sm:gap-4 w-full h-full items-center justify-center auto-rows-fr ${getGridClass(
            tiles.length
          )}`}
        >
          {tiles.map((tile) => (
            <div key={tile.id} className="w-full h-full flex items-center justify-center">
              <VideoTile
                stream={tile.stream}
                name={tile.name}
                isLocal={tile.isLocal}
                isAudioMuted={tile.isAudioMuted}
                isVideoMuted={tile.isVideoMuted}
                isScreenTile={tile.isScreenTile}
                role={tile.role}
                onPin={() => handleTogglePin(tile.id)}
                isPinned={pinnedTileId === tile.id}
                fitMode="contain"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
