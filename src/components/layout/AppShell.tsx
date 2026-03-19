import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { RunToolbar } from '../shared/RunToolbar';
import { useSettingsStore } from '../../stores/settingsStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useLogsStore } from '../../stores/logsStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useProjectsStore } from '../../stores/projectsStore';

export function AppShell() {
  const theme = useSettingsStore((state) => state.settings.theme);
  const gatewayUrl = useSettingsStore((state) => state.settings.gatewayUrl);
  const projectRoots = useSettingsStore((state) => state.settings.projectRoots);
  const initializeConnection = useConnectionStore((state) => state.initialize);
  const connectGateway = useConnectionStore((state) => state.connect);
  const disconnectGateway = useConnectionStore((state) => state.disconnect);
  const initializeSessions = useSessionStore((state) => state.initialize);
  const startLogStream = useLogsStore((state) => state.startStream);
  const initializeProjects = useProjectsStore((state) => state.initializeProjects);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const stopLogs = startLogStream();
    const stopConnection = initializeConnection();
    const stopSessions = initializeSessions();

    return () => {
      stopSessions();
      stopConnection();
      stopLogs();
    };
  }, [initializeConnection, initializeSessions, startLogStream]);

  useEffect(() => {
    void connectGateway(gatewayUrl);
  }, [connectGateway, gatewayUrl]);

  useEffect(() => {
    void initializeProjects();
  }, [initializeProjects, projectRoots]);

  useEffect(() => () => {
    void disconnectGateway();
  }, [disconnectGateway]);

  return (
    <div className="flex min-h-screen bg-app-bg text-app-text">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <RunToolbar />
        <main className="min-h-0 flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
