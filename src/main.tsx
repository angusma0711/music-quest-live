import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const TeacherApp = lazy(() => import('./teacher/TeacherApp'));
const StudentApp = lazy(() => import('./student/StudentApp'));

function Home() {
  return (
    <main className="home">
      <h1>音樂王國：失落的四大家族</h1>
      <p>課堂音樂冒險</p>
      <div className="home-links">
        <a className="btn btn-primary btn-xl" href="/join">我是學生：加入冒險</a>
        <a className="btn btn-ghost" href="/teacher">Teacher 老師登入</a>
      </div>
    </main>
  );
}

function Router() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/teacher') return <TeacherApp />;
  if (path === '/join') return <StudentApp />;
  return <Home />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="center-screen">載入中…</div>}>
      <Router />
    </Suspense>
  </StrictMode>,
);
