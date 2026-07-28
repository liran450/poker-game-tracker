import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SyncIndicator } from './SyncIndicator';

describe('<SyncIndicator>', () => {
  it('shows a checkmark in synced state', () => {
    const { container } = render(<SyncIndicator state="synced" />);
    expect(container.textContent).toContain('✓');
  });

  it('shows a pulsing dot in syncing state', () => {
    const { container } = render(<SyncIndicator state="syncing" />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('shows the pending count in pending state', () => {
    render(<SyncIndicator state="pending" pendingCount={5} />);
    expect(screen.getByText('5')).toBeDefined();
  });

  it('shows an exclamation mark in failed state', () => {
    const { container } = render(<SyncIndicator state="failed" />);
    expect(container.textContent).toContain('!');
  });

  it('has an accessible label describing the state', () => {
    render(<SyncIndicator state="pending" pendingCount={3} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('aria-label')).toBeTruthy();
  });

  it('meets minimum tap target size', () => {
    const { container } = render(<SyncIndicator state="synced" />);
    const btn = container.querySelector('button');
    expect(btn!.className).toContain('min-h-tap');
    expect(btn!.className).toContain('min-w-tap');
  });
});
