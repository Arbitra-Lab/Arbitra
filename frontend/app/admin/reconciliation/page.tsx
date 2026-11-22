'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAccessToken } from '@/lib/api-client';

type Row = {
  id: string;
  userId: string;
  agreementId: string | null;
  propertyId: string | null;
  amount: number;
  currency: string;
  status: string;
  refundStatus: string;
  referenceNumber: string | null;
  transactionHash: string | null;
  createdAt: string;
  reconciledAt: string | null;
  manualReconciliationStatus: 'verified' | 'corrected' | null;
  manualReconciliationNote: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

async function apiFetch(path: string, init?: RequestInit) {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await res.text());
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res.text();
}

export default function AdminReconciliationPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ from: '', to: '', userId: '', propertyId: '', minAmount: '', maxAmount: '', status: '' });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) p.set(k, v); });
    p.set('limit', '50');
    return p.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiFetch(`/admin/reconciliation/transactions?${query}`);
      setRows(json.data || []);
    } catch {
      toast.error('Failed to load reconciliation transactions');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const mark = async (id: string, status: 'verified' | 'corrected') => {
    try {
      await apiFetch(`/admin/reconciliation/transactions/${id}/reconcile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      toast.success(`Marked as ${status}`);
      await load();
    } catch {
      toast.error('Manual reconciliation failed');
    }
  };

  const exportCsv = async () => {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE}/admin/reconciliation/transactions/export?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'reconciliation-transactions.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('CSV export failed');
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Transaction Reconciliation</h1>
          <p className="text-sm text-neutral-200/60">Review blockchain/internal transaction state, filter, export, and manually reconcile.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10"><RefreshCw className="h-4 w-4" />Refresh</button>
          <button onClick={() => void exportCsv()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10"><Download className="h-4 w-4" />Export CSV</button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {(['from','to','userId','propertyId','minAmount','maxAmount'] as const).map((k) => (
          <input key={k} placeholder={k} value={(filters as any)[k]} onChange={(e) => setFilters((f) => ({ ...f, [k]: e.target.value }))} className="rounded-xl bg-slate-900 px-3 py-2 text-white border border-white/10" />
        ))}
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className="rounded-xl bg-slate-900 px-3 py-2 text-white border border-white/10 md:col-span-2">
          <option value="">All statuses</option>
          {['pending','completed','failed','refunded','partial_refund','disputed'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="overflow-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-neutral-200/80">
            <tr>
              {['Created','User','Agreement/Property','Amount','Status','Reference/Hash','Reconciliation','Actions'].map((h) => <th key={h} className="p-3 text-left font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4 text-neutral-300" colSpan={8}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="p-4 text-neutral-300" colSpan={8}>No transactions found.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="p-3 text-neutral-200">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="p-3 text-neutral-200">{r.userId}</td>
                <td className="p-3 text-neutral-200">{r.propertyId || r.agreementId || '-'}</td>
                <td className="p-3 text-white">{r.amount} {r.currency}</td>
                <td className="p-3 text-neutral-200">{r.status}{r.refundStatus && r.refundStatus !== 'none' ? ` / ${r.refundStatus}` : ''}</td>
                <td className="p-3 text-neutral-300 break-all">{r.referenceNumber || r.transactionHash || '-'}</td>
                <td className="p-3 text-neutral-200">
                  {r.manualReconciliationStatus ? (
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-green-400" />{r.manualReconciliationStatus}</span>
                  ) : r.reconciledAt ? <span className="text-green-300">auto</span> : <span className="inline-flex items-center gap-1 text-amber-300"><AlertTriangle className="h-4 w-4" />pending</span>}
                </td>
                <td className="p-3"><div className="flex gap-2"><button onClick={() => void mark(r.id, 'verified')} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white hover:bg-white/10">Verify</button><button onClick={() => void mark(r.id, 'corrected')} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-white hover:bg-white/10">Correct</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
