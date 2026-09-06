import React from 'react';
import { X, Crown, Mic, MicOff, Video, VideoOff, UserMinus, Shield } from 'lucide-react';

export function ParticipantsDrawer({
  isOpen,
  onClose,
  participants = [],
  currentUserId,
  isHost,
  onKickParticipant
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed sm:static inset-y-0 right-0 w-full sm:w-80 bg-meet-surface border-l border-white/10 flex flex-col z-40 shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-white">People</h2>
          <span className="bg-white/10 text-xs px-2 py-0.5 rounded-full text-gray-300 font-medium">
            {participants.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {participants.map((p) => {
          const isSelf = p.socketId === currentUserId;
          const isUserHost = p.role === 'host';

          return (
            <div
              key={p.socketId}
              className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5"
            >
              <div className="flex items-center gap-3 truncate mr-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                  {p.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-sm font-medium text-gray-200 truncate">
                      {p.name} {isSelf && '(You)'}
                    </span>
                    {isUserHost && (
                      <Crown className="w-3.5 h-3.5 text-meet-yellow flex-shrink-0" title="Host" />
                    )}
                  </div>
                  <span className="text-[11px] text-gray-400 capitalize">
                    {isUserHost ? 'Meeting Host' : 'Participant'}
                  </span>
                </div>
              </div>

              {/* Status Icons & Host Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Audio Status */}
                <div className="p-1.5 rounded text-gray-400">
                  {p.mediaState?.audio ? (
                    <Mic className="w-4 h-4 text-meet-green" />
                  ) : (
                    <MicOff className="w-4 h-4 text-meet-danger" />
                  )}
                </div>

                {/* Video Status */}
                <div className="p-1.5 rounded text-gray-400">
                  {p.mediaState?.video ? (
                    <Video className="w-4 h-4 text-gray-300" />
                  ) : (
                    <VideoOff className="w-4 h-4 text-meet-danger" />
                  )}
                </div>

                {/* Host Controls: Kick User */}
                {isHost && !isSelf && (
                  <button
                    onClick={() => onKickParticipant(p.socketId)}
                    className="p-1.5 text-gray-400 hover:text-meet-danger hover:bg-meet-danger/10 rounded transition-colors"
                    title={`Remove ${p.name} from meeting`}
                  >
                    <UserMinus className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
