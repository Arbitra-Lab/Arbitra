import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeSelector } from '@/components/settings/ThemeSelector';

describe('ThemeSelector (#27)', () => {
  it('renders all three theme choices and marks the active one', () => {
    render(<ThemeSelector value="system" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports the selected theme and blocks changes when disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ThemeSelector value="light" onChange={onChange} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledWith('dark');

    rerender(<ThemeSelector value="light" disabled onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Dark' })).toBeDisabled();
  });
});
