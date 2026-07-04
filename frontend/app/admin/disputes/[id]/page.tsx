'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/authStore';
import { DisputeDetail } from '@/components/admin/disputes/DisputeDetail';
import {
  loadAdminDisputeDetail,
  submitAdminDisputeResolution,
  type AdminDisputeDetail,
  type AdminDisputeResolutionEntry,
  type AdminDisputeTimelineEvent,
} from '@/lib/admin-dispute-detail';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminDisputeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { user, loading: authLoading } = useAuth();

  const [dispute, setDispute] = useState<AdminDisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user?.role !== 'admin') {
      router.replace('/');
    }
  }, [authLoading, user?.role, router]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const d = await loadAdminDisputeDetail(id);
      if (!d) {
        setNotFound(true);
        setDispute(null);
      } else {
        setDispute(d);
      }
    } catch {
      setNotFound(true);
      setDispute(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authLoading || user?.role !== 'admin') return;
    void refresh();
  }, [authLoading, user?.role, refresh]);

  const handleSubmitResolution = async (args: {
    resolutionNotes: string;
    action: 'approve' | 'reject';
  }) => {
    if (!dispute) return;
    setSubmitting(true);
    try {
      await submitAdminDisputeResolution(dispute.id, {
        resolutionNotes: args.resolutionNotes,
        action: args.action,
      });

      const decidedAt = new Date().toISOString();
      const entry: AdminDisputeResolutionEntry = {
        id: `local-${Date.now()}`,
        decision: args.action === 'approve' ? 'approve' : 'reject',
        notes: args.resolutionNotes,
        decidedByName: user ? `${user.firstName} ${user.lastName}` : 'Admin',
        decidedByRole: 'admin',
        decidedAt,
      };

      const timelineEvent: AdminDisputeTimelineEvent = {
        id: `tl-${Date.now()}`,
        type: 'resolution_decision',
        title: 'Resolution recorded',
        description:
          args.action === 'approve' ? 'Claim approved.' : 'Claim rejected.',
        actorName: user ? `${user.firstName} ${user.lastName}` : 'Admin',
        actorRole: 'admin',
        createdAt: decidedAt,
      };

      setDispute((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: args.action === 'approve' ? 'RESOLVED' : 'REJECTED',
          updatedAt: decidedAt,
          resolutionHistory: [entry, ...prev.resolutionHistory],
          timeline: [...prev.timeline, timelineEvent],
        };
      });

      toast.success(
        args.action === 'approve'
          ? 'Resolution recorded — case marked resolved.'
          : 'Resolution recorded — case rejected.',
      );
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to record resolution.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-neutral-200/80">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-neutral-200/80">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  if (notFound || !dispute) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-4 py-16">
        <p className="text-white text-lg font-semibold">Dispute not found</p>
        <p className="text-slate-400 text-sm">
          This case may have been removed or the link is invalid.
        </p>
        <button
          type="button"
          onClick={() => router.push('/admin/disputes')}
          className="text-brand-accent hover:text-brand-accent/80 font-medium"
        >
          Back to disputes
        </button>
      </div>
    );
  }

  return (
    <DisputeDetail
      dispute={dispute}
      onBack={() => router.push('/admin/disputes')}
      onSubmitResolution={handleSubmitResolution}
      isSubmitting={submitting}
    />
  );
}
