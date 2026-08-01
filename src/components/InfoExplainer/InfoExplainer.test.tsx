import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InfoExplainer } from './InfoExplainer';

describe('<InfoExplainer>', () => {
  it('content is hidden until the ⓘ is tapped, then dismisses on a second tap', async () => {
    render(<InfoExplainer content="תוצאה עקיפה שלא ברורה מהתווית" />);

    expect(screen.queryByRole('tooltip')).toBeNull();

    const trigger = screen.getByRole('button', { name: 'gallery.infoExplainer' });
    await userEvent.click(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('תוצאה עקיפה שלא ברורה מהתווית');

    await userEvent.click(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('dismisses on Escape', async () => {
    render(<InfoExplainer content="הסבר" />);
    await userEvent.click(screen.getByRole('button', { name: 'gallery.infoExplainer' }));
    expect(screen.getByRole('tooltip')).toBeDefined();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
