import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/admin'),
}));

vi.mock('@/store/authStore', () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: 'admin-1',
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      avatar: '/avatar.png',
    },
  })),
  useAuthStore: vi.fn(() => ({
    user: {
      id: 'admin-1',
      email: 'admin@test.com',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      avatar: '/avatar.png',
    },
  })),
}));

vi.mock('next/image', () => ({
  default: (
    props: React.ImgHTMLAttributes<HTMLImageElement> & {
      fill?: boolean;
      priority?: boolean;
    },
  ) => {
    const { fill, priority, ...rest } = props;
    return React.createElement('img', rest);
  },
}));

vi.mock('next/link', () => ({
  default: (
    props: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      children: React.ReactNode;
    },
  ) => React.createElement('a', props, props.children),
}));

vi.mock('@/components/Logo', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('div', { 'data-testid': 'logo', ...props }, 'Logo'),
}));

import Sidebar from '../Sidebar';

describe('Admin Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the sidebar with Logo', () => {
    render(<Sidebar />);

    expect(screen.getByTestId('logo')).toBeInTheDocument();
  });

  it('renders navigation items for admin role', () => {
    render(<Sidebar />);

    expect(screen.getByText('Disputes Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Arbiters Management')).toBeInTheDocument();
  });

  it('renders user avatar and name', () => {
    render(<Sidebar />);

    const avatarImg = screen.getByAltText('User Avatar');
    expect(avatarImg).toBeInTheDocument();
    expect(avatarImg).toHaveAttribute('src', '/avatar.png');
  });

  it('renders user role badge', () => {
    render(<Sidebar />);

    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('renders navigation links with correct hrefs', () => {
    render(<Sidebar />);

    const disputesLink = screen.getByText('Disputes Dashboard').closest('a');
    expect(disputesLink).toHaveAttribute('href', '/admin/disputes');

    const arbitersLink = screen.getByText('Arbiters Management').closest('a');
    expect(arbitersLink).toHaveAttribute('href', '/admin/arbiters');
  });
});
