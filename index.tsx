import React from 'react';
import ReactDOM from 'react-dom/client';
// Three typefaces, bundled with the site so they load fast and work offline:
// Inter for labels and numbers, Playfair Display for the sentence, Cinzel for the logo.
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/cinzel/wght.css';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Package S1: a phone opening a room link (?room=CODE) downloads only the phone app.
// Everyone else, and a phone that leaves the room, gets the full teacher app.
async function showTeacherApp() {
  const { App } = await import('./App');
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

async function showStudentApp(roomCode: string) {
  const { default: StudentApp } = await import('./student/StudentApp');
  const leave = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url.toString());
    void showTeacherApp();
  };
  root.render(
    <React.StrictMode>
      <StudentApp initialRoomCode={roomCode} onExit={leave} />
    </React.StrictMode>
  );
}

const roomCode = new URLSearchParams(window.location.search).get('room') || '';
void (roomCode.trim() ? showStudentApp(roomCode) : showTeacherApp());
