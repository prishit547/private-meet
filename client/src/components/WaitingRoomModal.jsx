import React from 'react';
import { UserCheck, UserX, Shield, CheckCheck } from 'lucide-react';

export function WaitingRoomModal({
  waitingList = [],
  onAdmit,
  onReject,
  onAdmitAll
}) {
  if (!waitingList || waitingList.length === 0) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-auto animate-bounce-short">
      <div className="bg-meet-surface/95 backdrop-blur-lg border border-white/20 rounded-2xl shadow-2xl p-4 text-white">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-meet-accent/20 text-meet-accent rounded-lg">
              <Shield className="w-4 h-4" />
            </div>
            <span className="text-sm font-semibold">
              Waiting Room ({waitingList.length})
            </span>
          </div>

          {waitingList.length > 1 && onAdmitAll && (
            <button
              onClick={onAdmitAll}
              className="text-xs text-meet-accent hover:underline flex items-center gap-1 font-medium"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Admit All
            </button>
          )}
        </div>

        <div className="mt-3 space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {waitingList.map((guest) => (
            <div
              key={guest.socketId}
              className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5"
            >
              <div className="flex items-center gap-2.5 truncate mr-2">
                <div className="w-8 h-8 rounded-full bg-meet-hover flex items-center justify-center text-xs font-bold text-gray-200">
                  {guest.name?.charAt(0)?.toUpperCase() || 'G'}
                </div>
                <div className="truncate">
                  <p className="text-sm font-medium text-gray-100 truncate">{guest.name}</p>
                  <p className="text-[11px] text-gray-400">Waiting to join</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={() => onReject(guest.socketId)}
                  className="px-2.5 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-1"
                  title="Deny entry"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Deny</span>
                </button>
                <button
                  onClick={() => onAdmit(guest.socketId)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-900 bg-meet-accent hover:bg-blue-300 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                  title="Admit to call"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Admit</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
