import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, Shield, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';

export function Lobby({
  roomId,
  userName,
  setUserName,
  onJoin,
  joinStatus,
  joinError,
  isHostPreset = false,
  onBackToHome
}) {
  const [localStream, setLocalStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const videoRef = useRef(null);

  // Initialize camera/mic preview
  useEffect(() => {
    let streamInstance = null;

    async function initPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 } },
          audio: true
        });
        streamInstance = stream;
        setLocalStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.warn('Camera/mic preview failed or denied:', err);
      }
    }

    initPreview();

    return () => {
      if (streamInstance) {
        streamInstance.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const toggleAudio = async () => {
    if (audioEnabled) {
      // Release physical microphone hardware
      if (localStream) {
        localStream.getAudioTracks().forEach(t => {
          t.stop();
          localStream.removeTrack(t);
        });
      }
      setAudioEnabled(false);
    } else {
      // Re-activate physical microphone hardware
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newTrack = audioStream.getAudioTracks()[0];
        if (newTrack) {
          if (localStream) {
            localStream.addTrack(newTrack);
          } else {
            const stream = new MediaStream([newTrack]);
            setLocalStream(stream);
          }
          setAudioEnabled(true);
        }
      } catch (err) {
        console.warn('Microphone permission denied or failed:', err);
      }
    }
  };

  const toggleVideo = async () => {
    if (videoEnabled) {
      // Release physical webcam hardware (green LED turns OFF)
      if (localStream) {
        localStream.getVideoTracks().forEach(t => {
          t.stop();
          localStream.removeTrack(t);
        });
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
      }
      setVideoEnabled(false);
    } else {
      // Re-activate physical webcam hardware (green LED turns ON)
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 } }
        });
        const newTrack = videoStream.getVideoTracks()[0];
        if (newTrack) {
          let targetStream = localStream;
          if (!targetStream) {
            targetStream = new MediaStream();
            setLocalStream(targetStream);
          }
          targetStream.addTrack(newTrack);
          if (videoRef.current) {
            videoRef.current.srcObject = targetStream;
          }
          setVideoEnabled(true);
        }
      } catch (err) {
        console.warn('Camera permission denied or failed:', err);
      }
    }
  };

  const handleJoinClick = (e) => {
    e.preventDefault();
    if (!userName.trim()) return;

    // Stop the preview stream so the main room can re-acquire without hardware conflicts
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }

    onJoin({
      audioInitial: audioEnabled,
      videoInitial: videoEnabled
    });
  };

  return (
    <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4 sm:p-6 select-none">
      {/* Top Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-8">
        <button
          onClick={onBackToHome}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Leave lobby</span>
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-400 bg-meet-surface px-3 py-1.5 rounded-full border border-white/10">
          <Shield className="w-3.5 h-3.5 text-meet-green" />
          <span>Private Server • End-to-End Encrypted</span>
        </div>
      </div>

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left: Camera Preview Tile */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="relative w-full aspect-video bg-meet-surface rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover mirror-video ${videoEnabled ? 'block' : 'hidden'}`}
            />

            {!videoEnabled && (
              <div className="flex flex-col items-center justify-center text-gray-400">
                <div className="w-20 h-20 rounded-full bg-meet-hover flex items-center justify-center text-2xl font-bold text-gray-200 mb-2">
                  {userName.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="text-xs">Camera is turned off</span>
              </div>
            )}

            {/* Bottom floating mic & camera toggles */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <button
                type="button"
                onClick={toggleAudio}
                className={`p-2.5 rounded-full transition-colors ${
                  audioEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-meet-danger text-white'
                }`}
                title={audioEnabled ? "Turn off mic" : "Turn on mic"}
              >
                {audioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={toggleVideo}
                className={`p-2.5 rounded-full transition-colors ${
                  videoEnabled ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-meet-danger text-white'
                }`}
                title={videoEnabled ? "Turn off camera" : "Turn on camera"}
              >
                {videoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">Check your camera and microphone before joining</p>
        </div>

        {/* Right: Meeting Join Form / Waiting States */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <div className="bg-meet-surface p-6 sm:p-8 rounded-2xl border border-white/10 shadow-xl">
            <h1 className="text-2xl font-bold text-white mb-1">
              {isHostPreset ? 'Ready to host?' : 'Ready to join?'}
            </h1>
            <p className="text-xs font-mono text-gray-400 mb-6 truncate">
              Room ID: {roomId}
            </p>

            {/* 1. Knocking / Waiting state */}
            {joinStatus === 'waiting' && (
              <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                <div className="p-4 bg-meet-accent/10 rounded-full text-meet-accent animate-spin">
                  <Loader2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Waiting for the host to let you in...
                  </h3>
                  <p className="text-xs text-gray-400 mt-1 max-w-xs">
                    Someone in the meeting will let you in shortly.
                  </p>
                </div>
              </div>
            )}

            {/* 2. Waiting for host to arrive state */}
            {joinStatus === 'waiting_host' && (
              <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
                <div className="p-3 bg-yellow-500/10 rounded-full text-meet-yellow">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">
                    Host hasn't joined yet
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    Please wait for the meeting host to start the call.
                  </p>
                </div>
              </div>
            )}

            {/* 3. Rejection / Error state */}
            {joinStatus === 'rejected' && (
              <div className="py-4 text-center space-y-3">
                <div className="p-3 bg-meet-danger/10 text-meet-danger rounded-xl flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{joinError || 'The host declined your request to join.'}</span>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-2.5 text-xs font-medium bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-white"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* 4. Normal Form (Idle) */}
            {joinStatus === 'idle' && (
              <form onSubmit={handleJoinClick} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1.5">
                    What's your name?
                  </label>
                  <input
                    type="text"
                    required
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="e.g. Alex Morgan"
                    className="w-full px-4 py-3 bg-meet-bg border border-white/10 rounded-xl text-white placeholder-gray-500 text-sm focus:outline-none focus:border-meet-accent transition-colors"
                  />
                </div>

                {joinError && (
                  <div className="p-3 bg-meet-danger/10 text-meet-danger rounded-xl flex items-center gap-2 text-xs">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{joinError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!userName.trim()}
                  className="w-full py-3.5 bg-meet-accent hover:bg-blue-400 disabled:opacity-50 disabled:pointer-events-none text-gray-950 font-semibold rounded-xl text-sm transition-colors shadow-lg shadow-meet-accent/20"
                >
                  {isHostPreset ? 'Join now (Host)' : 'Ask to join'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
