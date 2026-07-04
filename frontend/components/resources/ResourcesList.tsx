'use client';
import Link from 'next/link';
import { FileText, PlayCircle, ShieldIcon } from 'lucide-react';

const mockResources = [
  {
    id: 'getting-started-user',
    title: 'User Guide: Getting Started',
    type: 'guide',
    role: 'user',
    slug: 'getting-started-user',
  },
  {
    id: 'security-deposit-faq',
    title: 'Understanding Security Deposits',
    type: 'faq',
    role: 'user',
    slug: 'security-deposit-faq',
  },
  {
    id: 'property-management',
    title: 'How to manage your properties',
    type: 'video',
    role: 'user',
    slug: 'property-management',
  },
];

export default function ResourcesList({
  role,
  search,
}: {
  role: string;
  search: string;
}) {
  const filtered = mockResources.filter(
    (r) =>
      r.role === role && r.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {filtered.length === 0 ? (
        <p className="text-slate-400 col-span-full text-center">
          No resources found.
        </p>
      ) : (
        filtered.map((r) => (
          <Link
            key={r.id}
            href={`/resources/${r.slug}`}
            className="block block h-full"
          >
            <div className="bg-slate-800/50 hover:bg-slate-800 transition-all rounded-2xl p-6 border border-white/10 hover:border-brand-accent/50 shadow-xl h-full flex flex-col">
              <div className="mb-4 text-brand-accent">
                {r.type === 'guide' ? (
                  <FileText />
                ) : r.type === 'video' ? (
                  <PlayCircle />
                ) : (
                  <ShieldIcon />
                )}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{r.title}</h3>
              <p className="text-sm text-slate-400 mt-auto uppercase tracking-wide font-medium">
                {r.type}
              </p>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
