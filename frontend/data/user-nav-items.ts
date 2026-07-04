import { navItems } from '@/types/sidebar-items';
import {
  Home,
  Wallet,
  FileText,
  Receipt,
  Flag,
  ShieldCheck,
  Bell,
  User,
} from 'lucide-react';

export const userNavItems: navItems[] = [
  {
    name: 'Overview',
    href: '/user',
    icon: Home,
  },
  {
    name: 'Wallet',
    href: '/user/wallet',
    icon: Wallet,
  },
  {
    name: 'Agreements',
    href: '/user/contracts',
    icon: FileText,
  },
  {
    name: 'Transactions',
    href: '/user/transactions',
    icon: Receipt,
  },
  {
    name: 'Disputes',
    href: '/user/disputes',
    icon: Flag,
  },
  {
    name: 'Notifications',
    href: '/user/notifications',
    icon: Bell,
  },
  {
    name: 'Security',
    href: '/user/security',
    icon: ShieldCheck,
  },
  {
    name: 'Profile',
    href: '/user/profile',
    icon: User,
  },
];
