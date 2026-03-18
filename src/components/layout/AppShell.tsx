import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { RunToolbar } from '../shared/RunToolbar';
import { useSettingsStore } from '../../stores/settingsStore';

export function AppShell() {
  const theme = useSettingsStore((state) => state.settings.theme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
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
