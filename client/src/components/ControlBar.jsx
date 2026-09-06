import React, { useState, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  PhoneOff,
  Users,
  MessageSquare,
  Link2,
  Check,
  ShieldAlert,
  Maximize2,
  Minimize2
} from 'lucide-react';

export function ControlBar({
  isAudioMuted,
  isVideoMuted,
  isScreenSharing,
  toggleAudio,
  toggleVideo,
  startScreenShare,
  stopScreenShare,
  onLeaveCall,
  participantCount = 1,
  toggleParticipants,
  isParticipantsOpen,
  toggleChat,
  isChatOpen,
  unreadChatCount = 0,
  isHost = false,
  onEndMeeting = null,
  roomId
}) {
  const [copied, setCopied] = useState(false);
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);
  const [isMeetingFullscreen, setIsMeetingFullscreen] = useState(false);

  // Sync fullscreen state with document events
  useEffect(() => {
    const handleFsChange = () => {
      setIsMeetingFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleMeetingFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="h-20 bg-meet-surface/90 backdrop-blur-md border-t border-white/10 px-4 flex items-center justify-between z-30">
      {/* Left: Meeting Details & Share Link */}
      <div className="hidden sm:flex items-center gap-3 w-1/4">
        <div className="text-sm font-medium text-gray-200 truncate">
          Room: <span className="font-mono text-gray-400">{roomId}</span>
        </div>
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-full transition-colors text-gray-200"
          title="Copy invitation link"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-meet-green" />
              <span className="text-meet-green">Copied</span>
            </>
          ) : (
            <>
              <Link2 className="w-3.5 h-3.5" />
              <span>Copy Link</span>
            </>
          )}
        </button>
      </div>

      {/* Center: Core AV & Screen Sharing Controls */}
      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-1 sm:w-2/4">
        {/* Microphone Toggle */}
        <button
          onClick={toggleAudio}
          className={`p-3.5 rounded-full transition-all duration-200 ${
            isAudioMuted
              ? 'bg-meet-danger text-white hover:bg-red-700 shadow-md shadow-red-900/30'
              : 'bg-meet-hover text-white hover:bg-white/20'
          }`}
          title={isAudioMuted ? 'Turn on microphone' : 'Turn off microphone'}
        >
          {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Camera Toggle */}
        <button
          onClick={toggleVideo}
          className={`p-3.5 rounded-full transition-all duration-200 ${
            isVideoMuted
              ? 'bg-meet-danger text-white hover:bg-red-700 shadow-md shadow-red-900/30'
              : 'bg-meet-hover text-white hover:bg-white/20'
          }`}
          title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Screen Share Toggle */}
        <button
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          className={`p-3.5 rounded-full transition-all duration-200 ${
            isScreenSharing
              ? 'bg-meet-accent text-gray-900 hover:bg-blue-400 ring-2 ring-meet-accent/50'
              : 'bg-meet-hover text-white hover:bg-white/20'
          }`}
          title={isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
        >
          <Monitor className="w-5 h-5" />
        </button>

        {/* Leave / End Call */}
        <div className="relative">
          {isHost ? (
            <>
              <button
                onClick={() => setShowLeaveMenu(prev => !prev)}
                className="p-3.5 rounded-full bg-meet-danger hover:bg-red-700 text-white transition-all shadow-md shadow-red-900/40"
                title="Leave or End Meeting"
              >
                <PhoneOff className="w-5 h-5" />
              </button>

              {showLeaveMenu && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-meet-surface border border-white/10 rounded-xl shadow-2xl p-2 w-52 flex flex-col gap-1 z-50">
                  <button
                    onClick={() => {
                      setShowLeaveMenu(false);
                      onLeaveCall();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    Just leave meeting
                  </button>
                  <button
                    onClick={() => {
                      setShowLeaveMenu(false);
                      onEndMeeting?.();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-meet-danger hover:bg-meet-danger/20 rounded-lg transition-colors flex items-center gap-2 font-medium"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    End meeting for all
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={onLeaveCall}
              className="p-3.5 rounded-full bg-meet-danger hover:bg-red-700 text-white transition-all shadow-md shadow-red-900/40"
              title="Leave call"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Right: Side Drawer Toggles & Meeting Fullscreen */}
      <div className="flex items-center justify-end gap-2 w-1/4">
        {/* Meeting Fullscreen Button */}
        <button
          onClick={toggleMeetingFullscreen}
          className={`p-3 rounded-full transition-colors ${
            isMeetingFullscreen ? 'bg-white/20 text-meet-accent' : 'hover:bg-white/10 text-gray-300'
          }`}
          title={isMeetingFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen Meeting'}
        >
          {isMeetingFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>

        {/* Participants Button */}
        <button
          onClick={toggleParticipants}
          className={`p-3 rounded-full relative transition-colors ${
            isParticipantsOpen ? 'bg-white/20 text-meet-accent' : 'hover:bg-white/10 text-gray-300'
          }`}
          title="Participants list"
        >
          <Users className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 bg-meet-surface border border-white/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-gray-200">
            {participantCount}
          </span>
        </button>

        {/* Chat Button */}
        <button
          onClick={toggleChat}
          className={`p-3 rounded-full relative transition-colors ${
            isChatOpen ? 'bg-white/20 text-meet-accent' : 'hover:bg-white/10 text-gray-300'
          }`}
          title="In-call chat"
        >
          <MessageSquare className="w-5 h-5" />
          {unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-meet-accent text-gray-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {unreadChatCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
