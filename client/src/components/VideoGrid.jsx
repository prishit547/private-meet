import React, { useState } from 'react';
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

  // Collect all available tiles:
  // 1. Local Screen Share (if active)
  // 2. Local Camera
  // 3. Remote Screen Shares (if any peer is sharing)
  // 4. Remote Cameras
  const tiles = [];

  // Local camera tile
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

  // Local screen share tile
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

  // Remote peer tiles
  remotePeers.forEach((peer, socketId) => {
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
  });

  // Auto-detect if any screen share exists to spotlight it
  const activeScreenTile = tiles.find(t => t.isScreenTile);
  const currentSpotlightId = pinnedTileId || (activeScreenTile ? activeScreenTile.id : null);

  const spotlightTile = currentSpotlightId ? tiles.find(t => t.id === currentSpotlightId) : null;
  const secondaryTiles = spotlightTile ? tiles.filter(t => t.id !== spotlightTile.id) : tiles;

  // Grid layout class determination for when no spotlight is active
  const getGridClass = (count) => {
    if (count <= 1) return 'grid-cols-1 max-w-4xl max-h-[80vh]';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 max-w-5xl';
    if (count <= 4) return 'grid-cols-1 sm:grid-cols-2 max-w-6xl';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3 max-w-7xl';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-w-7xl';
  };

  return (
    <div className="w-full h-full flex-1 p-3 sm:p-4 overflow-hidden flex items-center justify-center">
      {/* 1. Spotlight / Presentation Mode */}
      {spotlightTile ? (
        <div className="w-full h-full flex flex-col lg:flex-row gap-4 items-center justify-center">
          {/* Spotlight Primary Viewport */}
          <div className="w-full lg:flex-1 h-[60vh] lg:h-full flex items-center justify-center">
            <VideoTile
              key={spotlightTile.id}
              stream={spotlightTile.stream}
              name={spotlightTile.name}
              isLocal={spotlightTile.isLocal}
              isAudioMuted={spotlightTile.isAudioMuted}
              isVideoMuted={spotlightTile.isVideoMuted}
              isScreenTile={spotlightTile.isScreenTile}
              role={spotlightTile.role}
              onPin={() => setPinnedTileId(null)}
              isPinned={true}
            />
          </div>

          {/* Side / Bottom Filmstrip */}
          {secondaryTiles.length > 0 && (
            <div className="w-full lg:w-72 xl:w-80 flex lg:flex-col flex-row gap-3 overflow-x-auto lg:overflow-y-auto max-h-[25vh] lg:max-h-full flex-shrink-0 p-1">
              {secondaryTiles.map(tile => (
                <div key={tile.id} className="w-48 lg:w-full h-28 lg:h-44 flex-shrink-0">
                  <VideoTile
                    stream={tile.stream}
                    name={tile.name}
                    isLocal={tile.isLocal}
                    isAudioMuted={tile.isAudioMuted}
                    isVideoMuted={tile.isVideoMuted}
                    isScreenTile={tile.isScreenTile}
                    role={tile.role}
                    onPin={() => setPinnedTileId(tile.id)}
                    isPinned={false}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* 2. Standard Grid Mode */
        <div className={`grid gap-3 sm:gap-4 w-full h-full items-center justify-center auto-rows-fr ${getGridClass(tiles.length)}`}>
          {tiles.map(tile => (
            <div key={tile.id} className="w-full h-full flex items-center justify-center">
              <VideoTile
                stream={tile.stream}
                name={tile.name}
                isLocal={tile.isLocal}
                isAudioMuted={tile.isAudioMuted}
                isVideoMuted={tile.isVideoMuted}
                isScreenTile={tile.isScreenTile}
                role={tile.role}
                onPin={() => setPinnedTileId(tile.id)}
                isPinned={false}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
