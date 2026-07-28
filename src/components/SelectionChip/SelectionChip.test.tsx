import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SelectionChip } from './SelectionChip';

/* eslint-disable local/no-literal-jsx-text */

describe('<SelectionChip>', () => {
  it('renders the label', () => {
    render(<SelectionChip label="test name" />);
    expect(screen.getByRole('option')).toHaveTextContent('test name');
  });

  it('has aria-selected=false when not selected', () => {
    render(<SelectionChip label="x" />);
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'false');
  });

  it('has aria-selected=true when selected', () => {
    render(<SelectionChip label="x" selected />);
    expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a checkmark when selected', () => {
    const { container } = render(<SelectionChip label="x" selected />);
    expect(container.textContent).toContain('✓');
  });

  it('shows the group marker when groupMember is true and not selected', () => {
    const { container } = render(<SelectionChip label="x" groupMember />);
    expect(container.textContent).toContain('◈');
  });

  it('hides the group marker when both selected and groupMember', () => {
    const { container } = render(<SelectionChip label="x" selected groupMember />);
    expect(container.textContent).not.toContain('◈');
    expect(container.textContent).toContain('✓');
  });

  it('applies accent border when selected', () => {
    const { container } = render(<SelectionChip label="x" selected />);
    expect(container.querySelector('button')!.className).toContain('border-accent');
  });

  it('calls onClick', async () => {
    const onClick = vi.fn();
    render(<SelectionChip label="x" onClick={onClick} />);
    await userEvent.click(screen.getByRole('option'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('meets minimum tap target size via class', () => {
    const { container } = render(<SelectionChip label="x" />);
    expect(container.querySelector('button')!.className).toContain('min-h-tap');
  });
});
