'use client';
import Link from 'next/link';

export default function ResourceDetail({ slug: _slug }: { slug: string }) {
  // basic mock data
  const data = {
    title: 'Tenant Guide: Getting Started',
    content:
      'Welcome to the platform! This guide will help you understand how to navigate the portal, pay rent, and submit maintenance requests. Follow the instructions below to get started...',
    date: '2026-03-20',
    category: 'Guide',
  };

  return (
    <div className="space-y-8">
      <Link href="/resources" className="text-brand-accent hover:text-brand-accent">
        ← Back to Resources
      </Link>

      <div className="bg-slate-800/50 border border-white/10 rounded-3xl p-8 shadow-2xl">
        <span className="text-xs font-bold uppercase tracking-widest text-brand-accent mb-4 inline-block">
          {data.category}
        </span>
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-6 text-gradient-verdict">
          {data.title}
        </h1>
        <p className="text-slate-500 text-sm mb-8">Last updated: {data.date}</p>

        <div className="prose prose-invert max-w-none text-slate-300 leading-relaxed md:text-lg">
          <p>{data.content}</p>
        </div>
      </div>

      <div className="flex gap-4 border-t border-white/10 pt-8 mt-8">
        <button className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all">
          Was this helpful?
        </button>
        <button className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-all">
          Share
        </button>
      </div>
    </div>
  );
}
