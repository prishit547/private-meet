import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Crown, Lock, Globe, Smile, ExternalLink } from 'lucide-react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🚀', '👋'];

// Helper to render text with clickable links
function formatMessageWithLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-meet-accent hover:text-blue-300 break-all inline-flex items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{part}</span>
          <ExternalLink className="w-3 h-3 inline-block" />
        </a>
      );
    }
    return part;
  });
}

export function ChatDrawer({
  isOpen,
  onClose,
  messages = [],
  onSendMessage,
  currentUserId,
  participants = []
}) {
  const [inputText, setInputText] = useState('');
  const [targetRecipientId, setTargetRecipientId] = useState('everyone');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [messages, isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(inputText.trim(), targetRecipientId);
    setInputText('');
  };

  const handleInsertEmoji = (emoji) => {
    setInputText((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  if (!isOpen) return null;

  // List of other participants to send direct messages to
  const otherParticipants = participants.filter((p) => p.socketId !== currentUserId);

  return (
    <div className="fixed sm:static inset-y-0 right-0 w-full sm:w-88 md:w-96 bg-meet-surface border-l border-white/10 flex flex-col z-40 shadow-2xl select-none">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">In-Call Messages</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Direct and group chat</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Recipient Selector */}
      <div className="px-4 py-2 bg-black/20 border-b border-white/10 flex items-center justify-between text-xs">
        <span className="text-gray-400 flex items-center gap-1.5 font-medium">
          {targetRecipientId === 'everyone' ? (
            <Globe className="w-3.5 h-3.5 text-meet-green" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-purple-400" />
          )}
          Send to:
        </span>
        <select
          value={targetRecipientId}
          onChange={(e) => setTargetRecipientId(e.target.value)}
          className="bg-meet-surface text-white text-xs border border-white/15 rounded-lg px-2.5 py-1 focus:outline-none focus:border-meet-accent"
        >
          <option value="everyone">Everyone in call</option>
          {otherParticipants.map((p) => (
            <option key={p.socketId} value={p.socketId}>
              {p.name} (Direct Message)
            </option>
          ))}
        </select>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-xs text-gray-500 text-center px-6 space-y-2">
            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400">
              💬
            </div>
            <p>No messages yet.</p>
            <p className="text-[11px] text-gray-500">
              Send a message or share a link with everyone in the call.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.senderId === currentUserId;
            const initials = msg.senderName
              ?.split(' ')
              .map((n) => n[0])
              .join('')
              .substring(0, 2)
              .toUpperCase() || 'U';

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'} space-y-1`}
              >
                {/* Sender Header */}
                <div className="flex items-center gap-1.5 text-[11px] px-1">
                  {!isSelf && (
                    <div className="w-4 h-4 rounded-full bg-indigo-600 flex items-center justify-center text-[9px] font-bold text-white">
                      {initials}
                    </div>
                  )}
                  <span className="font-semibold text-gray-300">
                    {isSelf ? 'You' : msg.senderName}
                  </span>
                  {msg.role === 'host' && (
                    <Crown className="w-3 h-3 text-meet-yellow flex-shrink-0" title="Host" />
                  )}
                  {msg.isDirect && (
                    <span className="bg-purple-500/20 text-purple-300 text-[10px] font-medium px-1.5 py-0.2 rounded flex items-center gap-0.5 border border-purple-500/30">
                      <Lock className="w-2.5 h-2.5" />
                      {isSelf ? `Private to ${msg.targetName || 'User'}` : 'Private to you'}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-500 ml-1">{msg.timestamp}</span>
                </div>

                {/* Message Bubble */}
                <div
                  className={`p-3 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-[85%] break-words select-text ${
                    isSelf
                      ? msg.isDirect
                        ? 'bg-purple-600 text-white rounded-tr-none shadow-md shadow-purple-900/30'
                        : 'bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-900/30'
                      : msg.isDirect
                      ? 'bg-purple-900/30 border border-purple-500/30 text-gray-200 rounded-tl-none'
                      : 'bg-white/10 border border-white/5 text-gray-200 rounded-tl-none'
                  }`}
                >
                  {formatMessageWithLinks(msg.message)}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Emoji Reaction Bar */}
      <div className="px-3 py-1.5 bg-black/30 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto">
        <Smile className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 ml-1" />
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleInsertEmoji(emoji)}
            className="px-2 py-0.5 rounded-lg hover:bg-white/15 text-sm transition-transform active:scale-125"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-white/10 bg-black/40 flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            targetRecipientId === 'everyone'
              ? 'Send a message to everyone...'
              : 'Send a private direct message...'
          }
          className="flex-1 px-3.5 py-2.5 bg-meet-bg border border-white/10 rounded-xl text-white placeholder-gray-500 text-xs sm:text-sm focus:outline-none focus:border-meet-accent transition-colors"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2.5 bg-meet-accent hover:bg-blue-400 disabled:opacity-40 disabled:pointer-events-none text-gray-950 rounded-xl transition-all shadow-md flex-shrink-0"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
