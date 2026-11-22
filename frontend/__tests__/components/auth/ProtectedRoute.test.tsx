import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

const replace = vi.fn();
let authState = { isAuthenticated: false, loading: false };
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/store/authStore', () => ({ useAuth: () => authState }));

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    authState = { isAuthenticated: true, loading: false };
    render(<ProtectedRoute><div>secret</div></ProtectedRoute>);
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});
