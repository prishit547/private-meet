import React, { useState } from 'react';
import { Video, Keyboard, Shield, Monitor, Users, Lock, Sparkles, ArrowRight } from 'lucide-react';
import { getSocket } from '../services/socket.js';

export function HomePage({ onEnterRoom }) {
  const [roomInput, setRoomInput] = useState('');
  const [hostName, setHostName] = useState(() => localStorage.getItem('pm_username') || '');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');

  const socket = getSocket();

  // Create new instant meeting as Host
  const handleCreateMeeting = () => {
    const finalHostName = hostName.trim() || 'Host';
    localStorage.setItem('pm_username', finalHostName);
    setIsCreating(true);
    setError('');

    socket.emit('create-room', { hostName: finalHostName }, (response) => {
      setIsCreating(false);
      if (response?.success) {
        // Store host token for this room
        localStorage.setItem(`pm_host_token_${response.roomId}`, response.hostToken);
        onEnterRoom(response.roomId);
      } else {
        setError(response?.error || 'Failed to create meeting room.');
      }
    });
  };

  // Join existing meeting with code or URL
  const handleJoinWithCode = (e) => {
    e.preventDefault();
    if (!roomInput.trim()) return;

    let code = roomInput.trim();
    // Parse URL if user pasted full link
    if (code.includes('/room/')) {
      code = code.split('/room/')[1]?.split('?')[0] || code;
    } else if (code.includes('/')) {
      code = code.split('/').pop()?.split('?')[0] || code;
    }

    if (code) {
      if (hostName.trim()) {
        localStorage.setItem('pm_username', hostName.trim());
      }
      onEnterRoom(code);
    }
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white flex flex-col justify-between selection:bg-meet-accent selection:text-gray-950">
      {/* Top Navigation */}
      <header className="px-6 py-5 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight">PrivateMeet</span>
            <span className="ml-2 text-[10px] uppercase tracking-wider bg-meet-green/20 text-meet-green px-2 py-0.5 rounded-full font-semibold">
              Self-Hosted
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-400 bg-meet-surface/80 px-3.5 py-1.5 rounded-full border border-white/10">
          <Shield className="w-3.5 h-3.5 text-meet-green" />
          <span>Zero 3rd-Party Relay • Your Server</span>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-12 flex-1 flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-16">
        {/* Left: Action & Info */}
        <div className="flex-1 space-y-8 text-center lg:text-left">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-meet-accent text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Private Google Meet Alternative</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Screen share & video calls, <br className="hidden sm:inline" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                100% on your own server.
              </span>
            </h1>
            <p className="text-gray-400 text-base sm:text-lg max-w-xl leading-relaxed">
              No Google, no Discord, no cloud interception. Share your laptop screen, conduct high-def video meetings, and admit guests through a secure waiting room.
            </p>
          </div>

          {/* User Name Field */}
          <div className="max-w-md mx-auto lg:mx-0">
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Your Display Name
            </label>
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="e.g. John Doe (Host)"
              className="w-full px-4 py-2.5 bg-meet-surface border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-meet-accent transition-colors"
            />
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 max-w-md mx-auto lg:mx-0">
            <button
              onClick={handleCreateMeeting}
              disabled={isCreating}
              className="flex items-center justify-center gap-2 px-6 py-3.5 bg-meet-accent hover:bg-blue-400 text-gray-950 font-bold rounded-xl text-sm transition-all shadow-lg shadow-meet-accent/20 flex-shrink-0"
            >
              <Video className="w-4 h-4" />
              <span>{isCreating ? 'Creating...' : 'New Meeting'}</span>
            </button>

            {/* Code / URL Input */}
            <form onSubmit={handleJoinWithCode} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Keyboard className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={roomInput}
                  onChange={(e) => setRoomInput(e.target.value)}
                  placeholder="Enter code or link"
                  className="w-full pl-10 pr-4 py-3 bg-meet-surface border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-meet-accent transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={!roomInput.trim()}
                className="px-4 py-3 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-sm font-medium transition-colors"
                title="Join meeting"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {error && (
            <p className="text-xs text-meet-danger font-medium">{error}</p>
          )}

          {/* Privacy Badges */}
          <div className="pt-4 border-t border-white/10 grid grid-cols-3 gap-4 text-center lg:text-left">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                <Monitor className="w-3.5 h-3.5 text-meet-accent" />
                <span>HD Screen Sharing</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Presentation mode with audio</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                <Users className="w-3.5 h-3.5 text-meet-green" />
                <span>Host Waiting Room</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Admit or decline knocking</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-200">
                <Lock className="w-3.5 h-3.5 text-meet-yellow" />
                <span>Zero 3rd Parties</span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">Direct peer-to-peer WebRTC</p>
            </div>
          </div>
        </div>

        {/* Right: Visual Illustration Card */}
        <div className="w-full max-w-md lg:max-w-none lg:w-5/12 flex items-center justify-center">
          <div className="w-full aspect-[4/3] bg-gradient-to-b from-meet-surface to-[#1a1b1e] rounded-3xl p-4 border border-white/10 shadow-2xl relative overflow-hidden flex flex-col justify-between">
            {/* Mock Screen Share Window */}
            <div className="w-full h-3/5 bg-black/60 rounded-2xl border border-white/10 flex flex-col items-center justify-center p-4 relative overflow-hidden group">
              <div className="absolute top-2 left-3 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-meet-danger/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-meet-yellow/80" />
                <span className="w-2.5 h-2.5 rounded-full bg-meet-green/80" />
              </div>
              <Monitor className="w-10 h-10 text-meet-accent mb-2" />
              <p className="text-xs text-gray-300 font-medium">Presenter's Screen Active</p>
              <span className="text-[10px] text-gray-500">60 FPS • Crystal Clear</span>
            </div>

            {/* Mock Participant Tiles */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="h-20 bg-black/40 rounded-xl border border-white/10 flex items-center justify-center gap-2 px-3">
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                  H
                </div>
                <div className="truncate">
                  <p className="text-xs font-medium text-gray-200 truncate">Host (You)</p>
                  <p className="text-[10px] text-meet-green">Speaking</p>
                </div>
              </div>

              <div className="h-20 bg-black/40 rounded-xl border border-white/10 flex items-center justify-center gap-2 px-3">
                <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                  G
                </div>
                <div className="truncate">
                  <p className="text-xs font-medium text-gray-200 truncate">Guest</p>
                  <p className="text-[10px] text-gray-400">Admitted</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 px-6 border-t border-white/5 text-center text-xs text-gray-500">
        Private Self-Hosted Screen Sharing & WebRTC Conferencing • Running on your Node.js server
      </footer>
    </div>
  );
}
