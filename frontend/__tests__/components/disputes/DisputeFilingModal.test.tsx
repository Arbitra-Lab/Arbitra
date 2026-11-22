import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { DisputeFilingModal } from '@/components/modals/DisputeFilingModal';

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/ui/Uploader', () => ({
  Uploader: () => <div data-testid="evidence-uploader" />,
}));

const DESCRIPTION =
  'The landlord never completed the agreed repairs after two written notices.';

const getForm = () =>
  document.getElementById('dispute-filing-form') as HTMLFormElement;

describe('DisputeFilingModal: dispute creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the dispute filing form with the prefilled agreement id', () => {
    render(
      <DisputeFilingModal isOpen onClose={() => {}} agreementId="agr_1" />,
    );

    expect(screen.getByText(/file a dispute/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('AGR-2025-014')).toHaveValue('agr_1');
    expect(screen.getByRole('combobox')).toHaveValue('MAINTENANCE');
    expect(screen.getByTestId('evidence-uploader')).toBeInTheDocument();
  });

  it('rejects a description shorter than 20 characters and does not submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <DisputeFilingModal isOpen onClose={() => {}} onSubmit={onSubmit} />,
    );

    fireEvent.change(screen.getByPlaceholderText('AGR-2025-014'), {
      target: { value: 'agr-1' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        'Describe the issue, timeline, and the outcome you are requesting...',
      ),
      { target: { value: 'too short' } },
    );
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText(/at least 20 characters/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('requires an agreement id before submitting', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <DisputeFilingModal isOpen onClose={() => {}} onSubmit={onSubmit} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        'Describe the issue, timeline, and the outcome you are requesting...',
      ),
      { target: { value: DESCRIPTION } },
    );
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(screen.getByText(/agreement id is required/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the typed values with a numeric requested amount', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <DisputeFilingModal
        isOpen
        onClose={onClose}
        agreementId="agr-42"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'RENT_PAYMENT' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 40000'), {
      target: { value: '40000' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        'Describe the issue, timeline, and the outcome you are requesting...',
      ),
      { target: { value: DESCRIPTION } },
    );
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        agreementId: 'agr-42',
        disputeType: 'RENT_PAYMENT',
        description: DESCRIPTION,
        requestedAmount: 40000,
        evidence: [],
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Dispute filed successfully');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('leaves the modal open and reports the error when filing fails', async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error('network unavailable'));
    const onClose = vi.fn();
    render(
      <DisputeFilingModal
        isOpen
        onClose={onClose}
        agreementId="agr-42"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        'Describe the issue, timeline, and the outcome you are requesting...',
      ),
      { target: { value: DESCRIPTION } },
    );
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('network unavailable');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('omits the requested amount when it is left blank', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <DisputeFilingModal
        isOpen
        onClose={() => {}}
        agreementId="agr-42"
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        'Describe the issue, timeline, and the outcome you are requesting...',
      ),
      { target: { value: DESCRIPTION } },
    );
    fireEvent.submit(getForm());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ requestedAmount: undefined }),
      );
    });
  });

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<DisputeFilingModal isOpen onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
