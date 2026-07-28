import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from './Sparkline';

describe('<Sparkline>', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Sparkline data={[0, 50, 100]} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('returns null when fewer than 2 data points', () => {
    const { container } = render(<Sparkline data={[42]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders a polyline for the line', () => {
    const { container } = render(<Sparkline data={[0, 50, 100]} />);
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('renders a polygon for the fill gradient', () => {
    const { container } = render(<Sparkline data={[0, 50, 100]} />);
    expect(container.querySelector('polygon')).not.toBeNull();
  });

  it('uses the positive colour when the last value is non-negative', () => {
    const { container } = render(<Sparkline data={[0, 50, 100]} />);
    const polyline = container.querySelector('polyline');
    expect(polyline!.getAttribute('stroke')).toContain('--color-positive');
  });

  it('uses the negative colour when the last value is negative', () => {
    const { container } = render(<Sparkline data={[0, -50, -100]} />);
    const polyline = container.querySelector('polyline');
    expect(polyline!.getAttribute('stroke')).toContain('--color-negative');
  });

  it('is marked as decorative with aria-hidden', () => {
    const { container } = render(<Sparkline data={[0, 50, 100]} />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
