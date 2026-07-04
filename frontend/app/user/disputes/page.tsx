'use client';

import Link from 'next/link';
import { Plus, Flag } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { DisputesList } from '@/components/user/DisputesList';
import { Suspense } from 'react';

export default function UserDisputesPage() {
  const { user, isAuthenticated, loading } = useAuthStore();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'user') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8">
        <Flag className="w-16 h-16 text-brand-accent/50 mb-5" />
        <h1 className="text-2xl font-black text-white mb-2">Access Denied</h1>
        <p className="text-neutral-200/50 mb-6">
          Disputes are only available to verified users.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl text-sm font-semibold transition-colors"
        >
          Connect Wallet
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Disputes
          </h1>
          <p className="text-neutral-200/50 mt-1">
            Manage all your rental disputes.
          </p>
        </div>
        <Link
          href="/user/disputes/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-blue hover:bg-brand-blue-dark text-white rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-brand-blue/20"
        >
          <Plus className="w-4 h-4" /> File New Dispute
        </Link>
      </div>

      <Suspense
        fallback={
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-12 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-accent" />
          </div>
        }
      >
        <DisputesList />
      </Suspense>
    </div>
  );
}
