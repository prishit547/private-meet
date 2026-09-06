import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Crown } from 'lucide-react';

export function ChatDrawer({
  isOpen,
  onClose,
  messages = [],
  onSendMessage,
  currentUserId
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(inputText.trim());
    setInputText('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed sm:static inset-y-0 right-0 w-full sm:w-80 bg-meet-surface border-l border-white/10 flex flex-col z-40 shadow-2xl">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">In-Call Messages</h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-3 bg-white/5 text-[11px] text-gray-400 border-b border-white/10 text-center">
        Messages are private and cleared when the meeting ends.
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-gray-500 text-center px-4">
            No messages yet. Send a message to everyone in the call.
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.senderId === currentUserId;
            return (
              <div key={msg.id} className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold text-gray-300">
                    {msg.senderName} {isSelf && '(You)'}
                  </span>
                  {msg.role === 'host' && (
                    <Crown className="w-3 h-3 text-meet-yellow" title="Host" />
                  )}
                  <span className="text-[10px] text-gray-500 ml-auto">{msg.timestamp}</span>
                </div>
                <div className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed break-words ${
                  isSelf ? 'bg-blue-600/30 text-white rounded-tr-none' : 'bg-white/10 text-gray-200 rounded-tl-none'
                }`}>
                  {msg.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-white/10 bg-black/20 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send a message..."
          className="flex-1 px-3.5 py-2.5 bg-meet-bg border border-white/10 rounded-xl text-white placeholder-gray-500 text-xs sm:text-sm focus:outline-none focus:border-meet-accent"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2.5 bg-meet-accent hover:bg-blue-400 disabled:opacity-40 disabled:pointer-events-none text-gray-950 rounded-xl transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
