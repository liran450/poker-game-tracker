import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { SessionProvider } from '../../hooks/useSession';
import { StatisticsPage } from './StatisticsPage';

describe('<StatisticsPage>', () => {
  it('shows the not-configured banner when there is no cloud backend (this sandbox, always)', () => {
    render(
      <MemoryRouter>
        <SessionProvider>
          <StatisticsPage />
        </SessionProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('auth.notConfigured')).toBeDefined();
  });
});
