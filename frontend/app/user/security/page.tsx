'use client';
import { ShieldCheck, Lock, Smartphone, AlertTriangle } from 'lucide-react';

export default function TenantSecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight mb-1">
          Account Security
        </h1>
        <p className="text-neutral-200/50">
          Manage your two-factor authentication and signed-in devices.
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center shrink-0">
            <ShieldCheck className="text-emerald-400" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">
              Your account is secured
            </h3>
            <p className="text-neutral-200/50 text-sm mb-3">
              No suspicious logins detected. Password updated 30 days ago.
            </p>
            <button className="text-emerald-400 hover:text-emerald-300 text-sm font-semibold transition-colors">
              Review security log →
            </button>
          </div>
        </div>
      </div>

      {/* Security Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all cursor-pointer group">
          <div className="w-10 h-10 bg-brand-accent/10 border border-brand-accent/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Smartphone className="text-brand-accent" size={20} />
          </div>
          <h3 className="text-white font-bold mb-1">
            Two-Factor Authentication
          </h3>
          <p className="text-neutral-200/40 text-sm">
            Add an extra layer of security to your account.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-bold text-amber-400 uppercase tracking-wider">
            <AlertTriangle size={12} />
            Not enabled
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all cursor-pointer group">
          <div className="w-10 h-10 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Lock className="text-purple-400" size={20} />
          </div>
          <h3 className="text-white font-bold mb-1">Change Password</h3>
          <p className="text-neutral-200/40 text-sm">
            Update your password to keep your account safe.
          </p>
          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-bold text-emerald-400 uppercase tracking-wider">
            <ShieldCheck size={12} />
            Up to date
          </div>
        </div>
      </div>
    </div>
  );
}
