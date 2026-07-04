/**
 * User Dashboard Types
 * Shared types for all dashboard components
 */

import type { LucideIcon } from 'lucide-react';

/**
 * Navigation item for sidebar
 */
export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  visibleFor?: ('user' | 'admin')[];
}

/**
 * Sidebar props
 */
export interface SidebarProps {
  navItems: NavItem[];
  isOpen?: boolean;
  onClose?: () => void;
  userRole?: 'user' | 'admin';
  className?: string;
}
