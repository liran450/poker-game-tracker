import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';

/* eslint-disable local/no-literal-jsx-text */

describe('<EmptyState>', () => {
  it('renders the title', () => {
    render(<EmptyState title="no data" />);
    expect(screen.getByText('no data')).toBeDefined();
  });

  it('renders the description when provided', () => {
    render(<EmptyState title="t" description="helpful text" />);
    expect(screen.getByText('helpful text')).toBeDefined();
  });

  it('renders the icon when provided', () => {
    render(<EmptyState title="t" icon="♠" />);
    expect(screen.getByText('♠')).toBeDefined();
  });

  it('renders the action slot when provided', () => {
    render(
      <EmptyState title="t" action={<button type="button">{'go'}</button>} />,
    );
    expect(screen.getByRole('button')).toHaveTextContent('go');
  });

  it('centers text content', () => {
    const { container } = render(<EmptyState title="t" />);
    expect(container.firstElementChild!.className).toContain('text-center');
  });
});
