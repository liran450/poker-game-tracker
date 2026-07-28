import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { minor } from '@core/money';

import { Money } from './Money';

describe('<Money>', () => {
  it('renders with dir="ltr" for bidi isolation', () => {
    const { container } = render(
      <Money value={minor(5000)} currency="ILS" />,
    );
    const span = container.querySelector('span');
    expect(span).not.toBeNull();
    expect(span!.getAttribute('dir')).toBe('ltr');
  });

  it('has tabular-nums class for aligned columns', () => {
    const { container } = render(
      <Money value={minor(5000)} currency="ILS" />,
    );
    const span = container.querySelector('span');
    expect(span!.className).toContain('tabular-nums');
  });

  it('renders a positive value with + when showSign is true', () => {
    render(<Money value={minor(5000)} currency="ILS" showSign />);
    const text = screen.getByText(/\+/);
    expect(text).toBeDefined();
  });

  it('renders a negative value with U+2212 minus, never a hyphen', () => {
    const { container } = render(
      <Money value={minor(-8000)} currency="ILS" showSign />,
    );
    const text = container.textContent;
    expect(text).toContain('−');
    expect(text).not.toMatch(/-/);
  });

  /**
   * THE critical RTL test: a negative amount rendered inside a Hebrew sentence
   * must put the minus sign on the correct side. Because the <Money> span has
   * dir="ltr", the browser isolates the number from the surrounding RTL context
   * and the minus stays leading (visually left of the digits).
   *
   * We verify structural correctness: the span has dir="ltr" and the text
   * starts with the minus sign. This is what prevents the classic `₪80-` bug
   * described in docs/04-ux-spec.md.
   */
  it('negative amount in Hebrew: minus sign is leading inside an LTR-isolated span', () => {
    const { container } = render(
      <span dir="rtl" lang="he">
        {'הפסדת '}
        <Money value={minor(-8000)} currency="ILS" showSign />
        {' הלילה'}
      </span>,
    );

    const moneySpan = container.querySelector('span[dir="ltr"]');
    expect(moneySpan).not.toBeNull();
    const text = moneySpan!.textContent;
    expect(text.charAt(0)).toBe('−');
  });

  it('applies positive/negative colour classes when showSign is true', () => {
    const { container: posContainer } = render(
      <Money value={minor(5000)} currency="ILS" showSign />,
    );
    expect(posContainer.querySelector('.text-positive')).not.toBeNull();

    const { container: negContainer } = render(
      <Money value={minor(-5000)} currency="ILS" showSign />,
    );
    expect(negContainer.querySelector('.text-negative')).not.toBeNull();
  });

  it('does not apply colour classes when showSign is false', () => {
    const { container } = render(
      <Money value={minor(5000)} currency="ILS" />,
    );
    expect(container.querySelector('.text-positive')).toBeNull();
    expect(container.querySelector('.text-negative')).toBeNull();
  });

  it('renders with size variant classes', () => {
    const { container } = render(
      <Money value={minor(5000)} currency="ILS" size="xl" />,
    );
    const span = container.querySelector('span');
    expect(span!.className).toContain('text-heading');
  });

  it('accepts a custom className', () => {
    const { container } = render(
      <Money value={minor(5000)} currency="ILS" className="custom-class" />,
    );
    const span = container.querySelector('span');
    expect(span!.className).toContain('custom-class');
  });
});
