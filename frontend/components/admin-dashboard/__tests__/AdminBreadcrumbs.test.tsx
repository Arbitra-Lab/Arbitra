import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminBreadcrumbs from '../AdminBreadcrumbs';

describe('AdminBreadcrumbs', () => {
  it('renders breadcrumbs for a known admin path', () => {
    render(<AdminBreadcrumbs pathname="/admin/disputes" />);

    const homeLink = screen.getByTitle('Admin Home');
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('href', '/admin');

    expect(screen.getByText('Admin')).toBeInTheDocument();

    expect(screen.getByText('Disputes Dashboard')).toBeInTheDocument();
  });

  it('renders breadcrumbs for arbiters path', () => {
    render(<AdminBreadcrumbs pathname="/admin/arbiters" />);

    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Arbiters Management')).toBeInTheDocument();
  });

  it('renders admin-only breadcrumbs when pathname is /admin', () => {
    render(<AdminBreadcrumbs pathname="/admin" />);

    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  it('renders fallback breadcrumb for unrecognized paths', () => {
    render(<AdminBreadcrumbs pathname="/unknown-path" />);

    expect(screen.getByText('Unknown Path')).toBeInTheDocument();
  });

  it('has correct aria-label on nav element', () => {
    render(<AdminBreadcrumbs pathname="/admin/disputes" />);

    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeInTheDocument();
  });

  it('renders the Home icon link', () => {
    render(<AdminBreadcrumbs pathname="/admin/arbiters" />);

    const homeLink = screen.getByTitle('Admin Home');
    expect(homeLink).toHaveAttribute('href', '/admin');
  });
});
