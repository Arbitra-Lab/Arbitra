import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { DisputeFilingModal } from '@/components/modals/DisputeFilingModal';

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

describe('DisputeFilingModal', () => {
  it('renders dispute filing form', () => {
    render(<DisputeFilingModal isOpen onClose={() => {}} agreementId="agr_1" />);
    expect(screen.getByText(/file dispute/i)).toBeInTheDocument();
  });
});
