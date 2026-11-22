import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const replace = vi.fn();
let authState = { isAuthenticated: false, loading: false };

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/store/authStore', () => ({ useAuth: () => authState }));

describe('ProtectedRoute: client-side auth guard', () => {
  beforeEach(() => {
    replace.mockClear();
    authState = { isAuthenticated: false, loading: false };
  });

  it('renders children when authenticated', () => {
    authState = { isAuthenticated: true, loading: false };
    render(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders a loading skeleton and does not redirect while auth is hydrating', () => {
    authState = { isAuthenticated: false, loading: true };
    render(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText(/verifying authentication/i)).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders nothing and redirects home when unauthenticated', () => {
    const { container } = render(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('redirects home once even after a rerender', () => {
    authState = { isAuthenticated: false, loading: false };
    const { rerender } = render(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );
    expect(replace).toHaveBeenCalledTimes(1);

    rerender(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('does not redirect an authenticated user who was initially loading', () => {
    authState = { isAuthenticated: false, loading: true };
    const { rerender } = render(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );
    expect(replace).not.toHaveBeenCalled();

    authState = { isAuthenticated: true, loading: false };
    rerender(
      <ProtectedRoute>
        <div>secret</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText('secret')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
