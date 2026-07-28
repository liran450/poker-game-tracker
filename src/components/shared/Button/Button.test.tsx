import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

describe('<Button>', () => {
  it('renders children', () => {
    render(<Button>{'click me'}</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('click me');
  });

  it('applies primary variant classes by default', () => {
    const { container } = render(<Button>{'ok'}</Button>);
    expect(container.querySelector('button')!.className).toContain('bg-accent');
  });

  it('applies secondary variant classes', () => {
    const { container } = render(<Button variant="secondary">{'ok'}</Button>);
    expect(container.querySelector('button')!.className).toContain('bg-surface-raised');
  });

  it('applies ghost variant classes', () => {
    const { container } = render(<Button variant="ghost">{'ok'}</Button>);
    expect(container.querySelector('button')!.className).toContain('bg-transparent');
  });

  it('applies destructive variant classes', () => {
    const { container } = render(<Button variant="destructive">{'ok'}</Button>);
    expect(container.querySelector('button')!.className).toContain('text-negative');
  });

  it('applies fullWidth class', () => {
    const { container } = render(<Button fullWidth>{'ok'}</Button>);
    expect(container.querySelector('button')!.className).toContain('w-full');
  });

  it('forwards disabled state', () => {
    render(<Button disabled>{'ok'}</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onClick handler', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>{'ok'}</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('applies size classes', () => {
    const { container } = render(<Button size="lg">{'ok'}</Button>);
    expect(container.querySelector('button')!.className).toContain('min-h-[54px]');
  });

  it('uses no physical CSS properties — logical only', () => {
    const { container } = render(<Button>{'ok'}</Button>);
    const classes = container.querySelector('button')!.className;
    expect(classes).not.toMatch(/\bml-|\bmr-|\bpl-|\bpr-|\bleft-|\bright-/);
  });
});
