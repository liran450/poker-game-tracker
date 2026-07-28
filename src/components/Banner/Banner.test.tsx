import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Banner } from './Banner';

describe('<Banner>', () => {
  it('renders children', () => {
    render(<Banner variant="success">{'balanced'}</Banner>);
    expect(screen.getByText('balanced')).toBeDefined();
  });

  it('uses role="alert" for error variant', () => {
    render(<Banner variant="error">{'error'}</Banner>);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('uses role="status" for success variant', () => {
    render(<Banner variant="success">{'ok'}</Banner>);
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('renders a dot indicator by default', () => {
    const { container } = render(<Banner variant="success">{'ok'}</Banner>);
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain('rounded-full');
  });

  it('applies correct tint class for each variant', () => {
    const { container: s } = render(<Banner variant="success">{'ok'}</Banner>);
    expect(s.querySelector('[role="status"]')!.className).toContain('bg-tint-positive');

    const { container: e } = render(<Banner variant="error">{'err'}</Banner>);
    expect(e.querySelector('[role="alert"]')!.className).toContain('bg-tint-negative');

    const { container: i } = render(<Banner variant="info">{'info'}</Banner>);
    expect(i.querySelector('[role="status"]')!.className).toContain('bg-surface-amber-dim');
  });

  it('renders an action element when provided', () => {
    render(
      <Banner variant="success" action={<button type="button">{'act'}</button>}>
        {'ok'}
      </Banner>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('act');
  });

  it('colour is never the sole meaning carrier — a dot is always present', () => {
    const { container } = render(<Banner variant="error">{'err'}</Banner>);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
