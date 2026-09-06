import React, { useState, useEffect, useRef } from 'react';
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
  Minimize2,
  ChevronUp,
  Volume2,
  Settings2
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
  roomId,
  // Audio device selection
  audioDevices = [],
  selectedAudioDevice = 'default',
  switchAudioDevice = null,
  audioOutputDevices = [],
  selectedAudioOutput = 'default',
  switchAudioOutput = null,
  refreshAudioDevices = null
}) {
  const [copied, setCopied] = useState(false);
  const [showLeaveMenu, setShowLeaveMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [isMeetingFullscreen, setIsMeetingFullscreen] = useState(false);
  const audioMenuRef = useRef(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (audioMenuRef.current && !audioMenuRef.current.contains(e.target)) {
        setShowAudioMenu(false);
      }
    };
    if (showAudioMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAudioMenu]);

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
        {/* Microphone Button with Split Device Picker Chevron */}
        <div className="relative flex items-center" ref={audioMenuRef}>
          <div className="flex items-center rounded-full bg-meet-hover overflow-hidden border border-white/5">
            <button
              onClick={toggleAudio}
              className={`p-3.5 transition-all duration-200 ${
                isAudioMuted
                  ? 'bg-meet-danger text-white hover:bg-red-700 shadow-md shadow-red-900/30'
                  : 'text-white hover:bg-white/20'
              }`}
              title={isAudioMuted ? 'Turn on microphone' : 'Turn off microphone'}
            >
              {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Audio Settings Dropdown Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowAudioMenu(prev => !prev);
                refreshAudioDevices?.();
              }}
              className={`px-1.5 py-3.5 border-l border-white/10 transition-colors ${
                isAudioMuted
                  ? 'bg-meet-danger text-white hover:bg-red-700'
                  : 'text-gray-300 hover:text-white hover:bg-white/20'
              }`}
              title="Select microphone & audio settings"
            >
              <ChevronUp className={`w-3.5 h-3.5 transition-transform duration-200 ${showAudioMenu ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Audio Device Selection Popover */}
          {showAudioMenu && (
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-[#1c1d22] border border-white/15 rounded-2xl shadow-2xl p-3.5 w-72 sm:w-80 flex flex-col gap-3 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center gap-2 text-xs font-semibold text-gray-200">
                  <Settings2 className="w-4 h-4 text-meet-accent" />
                  <span>Audio Devices</span>
                </div>
                <button
                  onClick={() => refreshAudioDevices?.()}
                  className="text-[11px] text-gray-400 hover:text-white transition-colors"
                >
                  Refresh
                </button>
              </div>

              {/* 1. Microphone Input Device Selection */}
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  <Mic className="w-3.5 h-3.5 text-meet-accent" />
                  <span>Microphone Input</span>
                </div>

                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                  {audioDevices.length === 0 ? (
                    <div className="text-xs text-gray-400 py-1 italic">
                      Default System Microphone
                    </div>
                  ) : (
                    audioDevices.map((device, idx) => {
                      const isSelected = selectedAudioDevice === device.deviceId ||
                        (selectedAudioDevice === 'default' && idx === 0);

                      return (
                        <button
                          key={device.deviceId || idx}
                          onClick={() => {
                            switchAudioDevice?.(device.deviceId);
                            setShowAudioMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-xl text-left transition-colors ${
                            isSelected
                              ? 'bg-meet-accent/15 text-meet-accent font-medium border border-meet-accent/30'
                              : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          <span className="truncate pr-2">{device.label || `Microphone ${idx + 1}`}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-meet-accent" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 2. Speaker Output Device Selection (if browser supports setSinkId) */}
              {audioOutputDevices.length > 0 && (
                <div className="pt-2 border-t border-white/10">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    <Volume2 className="w-3.5 h-3.5 text-meet-accent" />
                    <span>Speaker / Output</span>
                  </div>

                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                    {audioOutputDevices.map((device, idx) => {
                      const isSelected = selectedAudioOutput === device.deviceId ||
                        (selectedAudioOutput === 'default' && idx === 0);

                      return (
                        <button
                          key={device.deviceId || idx}
                          onClick={() => {
                            switchAudioOutput?.(device.deviceId);
                            setShowAudioMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-xl text-left transition-colors ${
                            isSelected
                              ? 'bg-meet-accent/15 text-meet-accent font-medium border border-meet-accent/30'
                              : 'text-gray-300 hover:bg-white/10'
                          }`}
                        >
                          <span className="truncate pr-2">{device.label || `Speaker ${idx + 1}`}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 flex-shrink-0 text-meet-accent" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

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
