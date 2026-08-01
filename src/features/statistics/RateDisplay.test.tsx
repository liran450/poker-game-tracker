import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RateDisplay } from './RateDisplay';

describe('<RateDisplay>', () => {
  it('shows the sample-size key alongside a non-suppressed rate', () => {
    render(<RateDisplay rate={{ value: 0.62, sampleSize: 13, suppressed: false }} />);
    expect(screen.getByText('statistics.sampleSize')).toBeDefined();
    expect(screen.queryByText('statistics.partialData')).toBeNull();
  });

  it('shows "partial data" instead of a number when suppressed', () => {
    render(<RateDisplay rate={{ value: 1, sampleSize: 1, suppressed: true }} />);
    expect(screen.getByText('statistics.partialData')).toBeDefined();
  });

  it('shows "partial data" when there is nothing to divide, even if not suppressed', () => {
    render(<RateDisplay rate={{ value: null, sampleSize: 10, suppressed: false }} />);
    expect(screen.getByText('statistics.partialData')).toBeDefined();
  });
});
