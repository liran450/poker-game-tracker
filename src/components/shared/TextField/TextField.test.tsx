/* eslint-disable local/no-literal-jsx-text -- test data, not user-facing text */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextField } from './TextField';

describe('<TextField>', () => {
  it('renders as a text input and forwards value/onChange', async () => {
    const onChange = vi.fn();
    render(<TextField aria-label="שם" value="" onChange={onChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'א');
    expect(onChange).toHaveBeenCalled();
  });

  it('meets the minimum tap target height', () => {
    render(<TextField aria-label="שם" />);
    expect(screen.getByRole('textbox').className).toContain('min-h-tap');
  });

  it('merges a custom className rather than replacing the base styles', () => {
    render(<TextField aria-label="שם" className="text-end" />);
    const input = screen.getByRole('textbox');
    expect(input.className).toContain('text-end');
    expect(input.className).toContain('min-h-tap');
  });
});
