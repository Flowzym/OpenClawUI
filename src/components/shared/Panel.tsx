import type { PropsWithChildren, ReactNode } from 'react';

interface PanelProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export function Panel({ title, subtitle, actions, className = '', children }: PanelProps) {
  return (
    <section className={`panel ${className}`}>
      {(title || subtitle || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-app-border px-4 py-3">
          <div>
            {title ? <h2 className="text-sm font-semibold text-app-text">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-xs text-app-muted">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
