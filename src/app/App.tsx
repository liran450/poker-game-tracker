import { HashRouter, Route, Routes } from 'react-router';

import { HomePage } from './routes/HomePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { DevBar } from './DevBar';

/**
 * Hash routing, not history routing: GitHub Pages has no SPA fallback, and the
 * 404.html workaround breaks share links in some in-app browsers
 * (02-architecture.md#hosting-details). Ugly URLs are a fair trade for links
 * that survive being pasted into WhatsApp.
 */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {import.meta.env.DEV && <DevBar />}
    </HashRouter>
  );
}
