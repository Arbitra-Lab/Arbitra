import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  EvidenceGallery,
  type EvidenceGalleryItem,
} from '@/components/common/EvidenceGallery';

const items: EvidenceGalleryItem[] = [
  {
    id: 'ev-1',
    label: 'Leak photo',
    type: 'image',
    url: '/globe.svg',
    uploadedByName: 'Amina Hassan',
    uploadedAt: '2026-02-18T10:05:00.000Z',
  },
  {
    id: 'ev-2',
    label: 'Inspection report',
    type: 'document',
    url: '/file.svg',
    uploadedByName: 'Amina Hassan',
    uploadedAt: '2026-02-19T14:30:00.000Z',
  },
];

describe('EvidenceGallery', () => {
  it('renders an empty message when there is no evidence', () => {
    render(<EvidenceGallery items={[]} />);
    expect(screen.getByText('No evidence uploaded.')).toBeInTheDocument();
  });

  it('renders a thumbnail card per evidence item', () => {
    render(<EvidenceGallery items={items} />);
    expect(screen.getByText('Leak photo')).toBeInTheDocument();
    expect(screen.getByText('Inspection report')).toBeInTheDocument();
  });

  it('opens an inline preview when a thumbnail is clicked', () => {
    render(<EvidenceGallery items={items} />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview Leak photo' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('1 / 2')).toBeInTheDocument();
  });

  it('navigates to the next item and closes on Escape', () => {
    render(<EvidenceGallery items={items} />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview Leak photo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next evidence' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('2 / 2')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
