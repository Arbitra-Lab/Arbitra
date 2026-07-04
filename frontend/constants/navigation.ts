export type NavigationLink = {
  name: string;
  href: string;
};

export const NAV_LINKS: NavigationLink[] = [
  { name: 'Agreements', href: '/user/contracts' },
  { name: 'Disputes', href: '/user/disputes' },
  { name: 'Resources', href: '/resources' },
];
