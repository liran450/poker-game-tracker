import type { ReactNode } from 'react';

export interface AppShellProps {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AppShell({ header, footer, children, className }: AppShellProps) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-surface-app">
      {header && (
        <header className="sticky top-0 z-20 border-b border-line bg-surface-app">
          {header}
        </header>
      )}
      <main
        className={[
          'flex-1 overflow-y-auto',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </main>
      {footer && (
        <footer className="sticky bottom-0 z-20 border-t border-line bg-surface-app">
          {footer}
        </footer>
      )}
    </div>
  );
}
