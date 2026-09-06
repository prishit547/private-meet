import React, { useEffect, useState } from 'react';
import { MessageSquare, X, Lock, Crown, ArrowRight } from 'lucide-react';

export function ChatToast({
  toastMessage,
  onOpenChat,
  onDismiss
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (toastMessage) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onDismiss?.(), 300);
      }, 6000);

      return () => clearTimeout(timer);
    }
  }, [toastMessage, onDismiss]);

  if (!toastMessage) return null;

  const initials = toastMessage.senderName
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'U';

  return (
    <div
      className={`fixed bottom-24 left-4 sm:left-6 z-50 max-w-sm w-[calc(100vw-2rem)] sm:w-96 transition-all duration-300 transform ${
        isVisible ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-4 opacity-0 scale-95 pointer-events-none'
      }`}
    >
      <div
        onClick={() => {
          onOpenChat();
          onDismiss?.();
        }}
        className="group bg-meet-surface/95 hover:bg-meet-surface backdrop-blur-xl border border-white/20 hover:border-meet-accent/50 rounded-2xl p-3.5 shadow-2xl cursor-pointer transition-all duration-200 relative overflow-hidden"
      >
        {/* Animated Progress Timer Bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10">
          <div className="h-full bg-meet-accent animate-shrink" />
        </div>

        <div className="flex items-start gap-3">
          {/* Sender Avatar */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow-md flex-shrink-0 mt-0.5">
            {initials}
          </div>

          {/* Message Content */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-bold text-white truncate max-w-[140px]">
                {toastMessage.senderName}
              </span>

              {toastMessage.role === 'host' && (
                <Crown className="w-3 h-3 text-meet-yellow flex-shrink-0" title="Host" />
              )}

              {toastMessage.isDirect && (
                <span className="bg-purple-500/20 text-purple-300 text-[10px] font-semibold px-1.5 py-0.2 rounded flex items-center gap-0.5 border border-purple-500/30">
                  <Lock className="w-2.5 h-2.5" />
                  Private
                </span>
              )}

              <span className="text-[10px] text-gray-400 ml-auto">
                {toastMessage.timestamp}
              </span>
            </div>

            <p className="text-xs text-gray-200 line-clamp-2 leading-relaxed break-words font-normal">
              {toastMessage.message}
            </p>

            <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-meet-accent group-hover:underline">
              <MessageSquare className="w-3 h-3" />
              <span>Click to reply</span>
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsVisible(false);
            setTimeout(() => onDismiss?.(), 200);
          }}
          className="absolute top-3 right-3 p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
