export const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export const statusTone = (status: string) => {
  switch (status) {
    case 'connected':
    case 'complete':
    case 'ready':
    case 'info':
      return 'text-app-success';
    case 'connecting':
    case 'running':
    case 'syncing':
    case 'degraded':
    case 'warn':
      return 'text-app-warn';
    case 'error':
    case 'deleted':
    case 'failed':
      return 'text-app-danger';
    default:
      return 'text-app-muted';
  }
};

export const statusBadge = (status: string) => {
  switch (status) {
    case 'connected':
    case 'complete':
    case 'ready':
      return 'bg-app-success/10 text-app-success border-app-success/40';
    case 'connecting':
    case 'running':
    case 'syncing':
    case 'degraded':
      return 'bg-app-warn/10 text-app-warn border-app-warn/40';
    case 'error':
    case 'deleted':
    case 'failed':
      return 'bg-app-danger/10 text-app-danger border-app-danger/40';
    default:
      return 'bg-app-panelAlt text-app-muted border-app-border';
  }
};
