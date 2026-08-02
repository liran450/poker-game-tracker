import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router';
import { useTranslation } from 'react-i18next';

import { SessionProvider } from '../hooks/useSession';
import { looksLikeAuthCallback } from './authCallback';
import { AccountPage } from './routes/AccountPage';
import { GroupPage } from './routes/GroupPage';
import { GroupsListPage } from './routes/GroupsListPage';
import { HomePage } from './routes/HomePage';
import { NewGamePage } from './routes/NewGamePage';
import { GamePage } from './routes/GamePage';
import { SharedGamePage } from './routes/SharedGamePage';
import { StatisticsPage } from './routes/StatisticsPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { DevBar } from './DevBar';

const GalleryPage = lazy(() =>
  import('./routes/GalleryPage').then((m) => ({ default: m.GalleryPage })),
);

/** Never wait past this even if the hash somehow never clears — a safety net, not a normal case. */
const AUTH_CALLBACK_SETTLE_TIMEOUT_MS = 4000;

/**
 * A magic-link/OAuth return trip lands with the session token in the URL
 * hash (`#access_token=...`) — briefly a "route" the hash router doesn't
 * recognise, until `detectSessionInUrl` parses it and clears the hash via
 * `history.replaceState`. Without this gate that moment renders the `*`
 * not-found fallback for a flash before settling on `/`.
 *
 * Polls the actual browser hash rather than gating on `useSession`'s
 * `loading` flag — that flag can flip to `false` a tick before
 * `supabase-js` finishes its own `replaceState` cleanup, which still let the
 * not-found flash through. `replaceState` fires no event to react to, so
 * polling (via `requestAnimationFrame`, cheap and only active for this one
 * brief window) is the reliable way to know the hash has actually cleared.
 */
function AppRoutes() {
  const { t } = useTranslation();
  const [hadAuthCallback] = useState(() => looksLikeAuthCallback(window.location.hash));
  const [settled, setSettled] = useState(() => !hadAuthCallback);

  useEffect(() => {
    if (settled) return;
    const startedAt = Date.now();
    let frame: number;
    function check(): void {
      if (!looksLikeAuthCallback(window.location.hash) || Date.now() - startedAt > AUTH_CALLBACK_SETTLE_TIMEOUT_MS) {
        setSettled(true);
        return;
      }
      frame = requestAnimationFrame(check);
    }
    frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [settled]);

  if (!settled) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-body text-fg-tertiary">{t('auth.signingIn')}</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/new" element={<NewGamePage />} />
      <Route path="/game/:gameId" element={<GamePage />} />
      <Route path="/s/:token" element={<SharedGamePage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/groups" element={<GroupsListPage />} />
      <Route path="/groups/:groupId" element={<GroupPage />} />
      <Route path="/statistics" element={<StatisticsPage />} />
      {import.meta.env.DEV && (
        <Route
          path="/gallery"
          element={
            <Suspense>
              <GalleryPage />
            </Suspense>
          }
        />
      )}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

/**
 * Hash routing, not history routing: GitHub Pages has no SPA fallback, and the
 * 404.html workaround breaks share links in some in-app browsers
 * (02-architecture.md#hosting-details). Ugly URLs are a fair trade for links
 * that survive being pasted into WhatsApp.
 */
export function App() {
  return (
    <HashRouter>
      <SessionProvider>
        <AppRoutes />
        {import.meta.env.DEV && <DevBar />}
      </SessionProvider>
    </HashRouter>
  );
}
