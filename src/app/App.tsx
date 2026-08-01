import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router';

import { SessionProvider } from '../hooks/useSession';
import { AccountPage } from './routes/AccountPage';
import { GroupPage } from './routes/GroupPage';
import { GroupsListPage } from './routes/GroupsListPage';
import { HomePage } from './routes/HomePage';
import { NewGamePage } from './routes/NewGamePage';
import { GamePage } from './routes/GamePage';
import { SharedGamePage } from './routes/SharedGamePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { DevBar } from './DevBar';

const GalleryPage = lazy(() =>
  import('./routes/GalleryPage').then((m) => ({ default: m.GalleryPage })),
);

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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/new" element={<NewGamePage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/s/:token" element={<SharedGamePage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/groups" element={<GroupsListPage />} />
          <Route path="/groups/:groupId" element={<GroupPage />} />
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
        {import.meta.env.DEV && <DevBar />}
      </SessionProvider>
    </HashRouter>
  );
}
