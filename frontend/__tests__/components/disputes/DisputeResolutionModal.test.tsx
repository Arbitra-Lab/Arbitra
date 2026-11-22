import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { DisputeResolutionModal } from '@/components/modals/DisputeResolutionModal';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const dispute = {
  id: 'disp-1234567890',
  title: 'Unreturned security deposit',
  description: 'The deposit was never returned after move-out.',
  category: 'SECURITY_DEPOSIT',
  priority: 'high',
  status: 'under_review' as const,
  raisedBy: 'tenant-1',
  raisedByName: 'Alice Tenant',
  createdAt: '2026-11-01T00:00:00.000Z',
};

const notes = 'Landlord provided receipts; refund the disputed amount.';

function renderModal(
  overrides: Partial<React.ComponentProps<typeof DisputeResolutionModal>> = {},
) {
  return render(
    <DisputeResolutionModal
      isOpen
      onClose={vi.fn()}
      dispute={dispute}
      {...overrides}
    />,
  );
}

describe('DisputeResolutionModal: admin arbitration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no dispute is selected', () => {
    const { container } = renderModal({ dispute: null });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the dispute details, status and priority', () => {
    renderModal();

    expect(screen.getByText(dispute.title)).toBeInTheDocument();
    expect(screen.getByText(/alice tenant/i)).toBeInTheDocument();
    expect(screen.getByText('UNDER REVIEW')).toBeInTheDocument();
    expect(screen.getByText('HIGH PRIORITY')).toBeInTheDocument();
  });

  it('refuses to resolve without a resolution note', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    renderModal({ onResolve });

    fireEvent.click(screen.getByRole('button', { name: /approve & resolve/i }));

    expect(toast.error).toHaveBeenCalledWith(
      'Please provide a resolution note',
    );
    expect(onResolve).not.toHaveBeenCalled();
  });

  it('approves a claim with the entered resolution notes', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    renderModal({ onResolve, onClose });

    fireEvent.change(
      screen.getByPlaceholderText(
        'Provide detailed notes about your decision and any actions taken...',
      ),
      { target: { value: notes } },
    );
    fireEvent.click(screen.getByRole('button', { name: /approve & resolve/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith(dispute.id, notes, 'approve');
    });
    expect(toast.success).toHaveBeenCalledWith(
      'Dispute resolved in favor of claimant',
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('rejects a claim with the entered resolution notes', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);
    renderModal({ onResolve });

    fireEvent.change(
      screen.getByPlaceholderText(
        'Provide detailed notes about your decision and any actions taken...',
      ),
      { target: { value: notes } },
    );
    fireEvent.click(screen.getByRole('button', { name: /reject claim/i }));

    await waitFor(() => {
      expect(onResolve).toHaveBeenCalledWith(dispute.id, notes, 'reject');
    });
    expect(toast.success).toHaveBeenCalledWith('Dispute rejected');
  });

  it('keeps the modal open and reports a failed resolution', async () => {
    const onResolve = vi.fn().mockRejectedValue(new Error('arbiter offline'));
    const onClose = vi.fn();
    renderModal({ onResolve, onClose });

    fireEvent.change(
      screen.getByPlaceholderText(
        'Provide detailed notes about your decision and any actions taken...',
      ),
      { target: { value: notes } },
    );
    fireEvent.click(screen.getByRole('button', { name: /approve & resolve/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('arbiter offline');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides resolution controls from non-admin users', () => {
    renderModal({ userRole: 'user' });

    expect(
      screen.queryByRole('button', { name: /approve & resolve/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /reject claim/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('does not offer resolution for an already resolved dispute', () => {
    renderModal({ dispute: { ...dispute, status: 'resolved' } });

    expect(screen.getByText('Dispute Resolved')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /approve & resolve/i }),
    ).not.toBeInTheDocument();
  });
});
