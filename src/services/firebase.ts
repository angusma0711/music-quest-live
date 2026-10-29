import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';

const env = import.meta.env;
export const usingEmulators = env.VITE_USE_EMULATORS === 'true' || !env.VITE_FIREBASE_API_KEY;

const config = usingEmulators
  ? {
      // "demo-" projects only ever talk to the local emulators; no real project needed.
      apiKey: 'demo-key',
      authDomain: 'demo-music-quest.firebaseapp.com',
      databaseURL: 'https://demo-music-quest-default-rtdb.firebaseio.com',
      projectId: 'demo-music-quest',
      appId: 'demo-app',
    }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL: env.VITE_FIREBASE_DATABASE_URL,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    };

function makeClient(name: string) {
  const app = initializeApp(config, name);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (usingEmulators) {
    // Use the page's host so iPads on the same Wi-Fi reach the emulators on the teacher's laptop.
    const host = window.location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(db, host, 9000);
  }
  return { auth, db };
}

// Separate app instances keep teacher and pupil sign-ins apart, so a teacher can open
// /join in another tab of the same browser to test without joining as themselves.
let teacherClient: ReturnType<typeof makeClient> | undefined;
let studentClient: ReturnType<typeof makeClient> | undefined;
export const getTeacherClient = () => (teacherClient ??= makeClient('teacher'));
export const getStudentClient = () => (studentClient ??= makeClient('student'));
