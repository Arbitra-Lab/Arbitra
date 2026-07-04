'use client';
import { Search } from 'lucide-react';

export default function ResourceSearch({
  query,
  onChange,
}: {
  query: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="max-w-2xl mx-auto relative mb-8">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
      <input
        type="text"
        placeholder="Search for articles, guides..."
        value={query}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-800/80 border border-white/10 rounded-full py-4 pl-12 pr-6 text-white placeholder:text-slate-500 shadow-xl focus:outline-none focus:ring-2 focus:ring-brand-accent transition-all"
      />
    </div>
  );
}
