import React, { useState, useEffect } from 'react';
import { HomePage } from './pages/HomePage.jsx';
import { MeetingPage } from './pages/MeetingPage.jsx';

function getRoomFromPath() {
  const path = window.location.pathname;
  const match = path.match(/^\/room\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export default function App() {
  const [currentRoomId, setCurrentRoomId] = useState(() => getRoomFromPath());

  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoomId(getRoomFromPath());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleEnterRoom = (roomId) => {
    window.history.pushState({}, '', `/room/${roomId}`);
    setCurrentRoomId(roomId);
  };

  const handleLeaveRoom = () => {
    window.history.pushState({}, '', '/');
    setCurrentRoomId(null);
  };

  if (currentRoomId) {
    return (
      <MeetingPage
        roomId={currentRoomId}
        onLeave={handleLeaveRoom}
      />
    );
  }

  return (
    <HomePage
      onEnterRoom={handleEnterRoom}
    />
  );
}
