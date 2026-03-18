import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { ChangesPage } from '../pages/ChangesPage';
import { HomePage } from '../pages/HomePage';
import { LogsPage } from '../pages/LogsPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { SessionsPage } from '../pages/SessionsPage';
import { SettingsPage } from '../pages/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'sessions', element: <SessionsPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'changes', element: <ChangesPage /> },
      { path: 'logs', element: <LogsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
