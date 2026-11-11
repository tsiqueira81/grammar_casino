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
import { RecoverBoundary } from './components/RecoverBoundary';
import { isE2eMode } from './utils/e2eContent';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Package S1: a phone opening a room link (?room=CODE) downloads only the phone app.
// Everyone else, and a phone that leaves the room, gets the full teacher app.
// Browser tests only (?e2e=1&crash=1 on the dev server): a screen that crashes, to check the way out.
function E2eCrash(): React.ReactElement {
  throw new Error('Test crash (e2e)');
}
const e2eCrash = isE2eMode() && new URLSearchParams(window.location.search).get('crash') === '1';

async function showTeacherApp() {
  const { App } = await import('./App');
  root.render(
    <React.StrictMode>
      <RecoverBoundary who="teacher">
        {e2eCrash ? <E2eCrash /> : <App />}
      </RecoverBoundary>
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
      <RecoverBoundary who="phone">
        {e2eCrash ? <E2eCrash /> : <StudentApp initialRoomCode={roomCode} onExit={leave} />}
      </RecoverBoundary>
    </React.StrictMode>
  );
}

// Package T3: the teacher's own phone as a remote (?room=CODE&remote=KEY).
async function showTeacherRemote(code: string, key: string) {
  const { default: TeacherRemoteApp } = await import('./student/TeacherRemoteApp');
  root.render(
    <React.StrictMode>
      <RecoverBoundary who="phone">
        <TeacherRemoteApp roomCode={code} remoteKey={key} />
      </RecoverBoundary>
    </React.StrictMode>
  );
}

const params = new URLSearchParams(window.location.search);
const roomCode = params.get('room') || '';
const remoteKey = (params.get('remote') || '').trim();
void (roomCode.trim() && /^[0-9a-f]{16}$/.test(remoteKey)
  ? showTeacherRemote(roomCode, remoteKey)
  : roomCode.trim()
    ? showStudentApp(roomCode)
    : showTeacherApp());
