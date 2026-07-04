'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  User,
  Mail,
  Phone,
  Wallet,
  Copy,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Camera,
  Lock,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/store/authStore';
import { getFreighterPublicKey } from '@/lib/stellar-auth';
import { Uploader } from '@/components/ui/Uploader';
import { toast } from 'react-hot-toast';

interface UserProfile {
  fullName: string;
  email: string;
  phone: string;
  profilePicture: string | null;
  isEmailVerified: boolean;
  walletAddress: string | null;
}

interface KycStatus {
  level: 'Unverified' | 'Basic' | 'Full';
  status: 'pending' | 'verified' | 'rejected' | 'none';
  progress: number;
}

export default function UserProfilePage() {
  const { user, accessToken } = useAuth();

  const [profile, setProfile] = useState<UserProfile>({
    fullName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    email: user?.email || '',
    phone: '',
    profilePicture: null,
    isEmailVerified: true,
    walletAddress: null,
  });

  const [kyc, setKyc] = useState<KycStatus>({
    level: 'Unverified',
    status: 'none',
    progress: 0,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        const profileRes = await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (profileRes.ok) {
          const data = await profileRes.json();
          setProfile((prev) => ({ ...prev, ...data }));
        }
        const kycRes = await fetch('/api/stellar/kyc', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (kycRes.ok) {
          const data = await kycRes.json();
          setKyc(data);
        } else {
          setKyc({ level: 'Basic', status: 'verified', progress: 33 });
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [accessToken, user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          fullName: profile.fullName,
          phone: profile.phone,
        }),
      });
      if (res.ok) {
        toast.success('Profile updated successfully');
        setIsEditing(false);
      } else throw new Error('Failed to update profile');
    } catch {
      toast.error('Update failed. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConnectWallet = async () => {
    setIsConnectingWallet(true);
    try {
      const publicKey = await getFreighterPublicKey();
      setProfile((prev) => ({ ...prev, walletAddress: publicKey }));
      toast.success('Wallet connected: ' + maskAddress(publicKey));
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to connect wallet',
      );
    } finally {
      setIsConnectingWallet(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };
  const maskAddress = (address: string) =>
    address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';

  const getKycBadge = () => {
    switch (kyc.level) {
      case 'Full':
        return (
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20">
            Full Verified
          </span>
        );
      case 'Basic':
        return (
          <span className="px-3 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-bold border border-brand-accent/20">
            Basic Verification
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full bg-white/5 text-neutral-200/40 text-xs font-bold border border-white/10">
            Unverified
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-accent"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            User Profile
          </h1>
          <p className="text-neutral-200/50 mt-1">
            Manage your account details and verification status.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {getKycBadge()}
          {kyc.level !== 'Full' && (
            <button className="text-sm font-semibold text-brand-accent hover:text-brand-accent/80 flex items-center transition-colors">
              Learn about KYC <ExternalLink size={14} className="ml-1" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-1 space-y-4">
          {/* Avatar Card */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-8 flex flex-col items-center text-center">
            <div className="relative group">
              <div className="w-28 h-28 rounded-full overflow-hidden bg-white/5 border-4 border-white/10 shadow-xl relative">
                {profile.profilePicture ? (
                  <Image
                    src={profile.profilePicture}
                    alt="Profile"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-200/20">
                    <User size={56} />
                  </div>
                )}
              </div>
              <button className="absolute bottom-0 right-0 p-2 bg-brand-blue text-white rounded-full shadow-lg hover:scale-110 transition-transform">
                <Camera size={16} />
              </button>
            </div>
            <h2 className="mt-4 text-xl font-bold text-white">
              {profile.fullName || 'User Name'}
            </h2>
            <p className="text-neutral-200/50 text-sm">{profile.email}</p>
            <div className="w-full mt-5 pt-5 border-t border-white/5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-200/40">Member since</span>
                <span className="font-medium text-white">Jan 2024</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-200/40">Account Type</span>
                <span className="font-medium capitalize text-white">
                  {user?.role || 'User'}
                </span>
              </div>
            </div>
          </div>

          {/* Wallet Card */}
          <div className="bg-gradient-to-br from-slate-900 to-brand-blue-dark border border-white/10 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Wallet size={80} />
            </div>
            <div className="relative z-10 space-y-4">
              <div className="flex items-center space-x-2">
                <Wallet size={18} className="text-brand-accent" />
                <h3 className="font-bold text-sm">Stellar Wallet</h3>
              </div>
              {profile.walletAddress ? (
                <div className="space-y-3">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/10 flex items-center justify-between">
                    <span className="font-mono text-xs text-neutral-200/60">
                      {maskAddress(profile.walletAddress)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(profile.walletAddress!)}
                      className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                  <button className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-semibold transition-colors">
                    Disconnect Wallet
                  </button>
                </div>
              ) : (
                <div className="space-y-3 text-center py-1">
                  <p className="text-xs text-neutral-200/40">
                    Connect your wallet to enable blockchain payments.
                  </p>
                  <button
                    onClick={handleConnectWallet}
                    disabled={isConnectingWallet}
                    className="w-full py-2.5 rounded-xl bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-bold transition-all shadow-lg active:scale-95 disabled:opacity-60"
                  >
                    {isConnectingWallet ? 'Connecting...' : 'Connect Wallet'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Profile Form */}
          <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">
                Personal Information
              </h3>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="text-sm font-semibold text-brand-accent hover:text-brand-accent/80 transition-colors"
              >
                {isEditing ? 'Cancel' : 'Edit Profile'}
              </button>
            </div>
            <form onSubmit={handleUpdateProfile} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  {
                    label: 'Full Name',
                    icon: User,
                    type: 'text',
                    value: profile.fullName,
                    onChange: (v: string) =>
                      setProfile((p) => ({ ...p, fullName: v })),
                    disabled: !isEditing,
                  },
                  {
                    label: 'Phone Number',
                    icon: Phone,
                    type: 'tel',
                    value: profile.phone,
                    onChange: (v: string) =>
                      setProfile((p) => ({ ...p, phone: v })),
                    disabled: !isEditing,
                    placeholder: '+234 000 000 0000',
                  },
                ].map(
                  ({
                    label,
                    icon: Icon,
                    type,
                    value,
                    onChange,
                    disabled,
                    placeholder,
                  }) => (
                    <div key={label} className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-200/50 uppercase tracking-wider">
                        {label}
                      </label>
                      <div className="relative">
                        <Icon
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-accent/30"
                          size={16}
                        />
                        <input
                          type={type}
                          disabled={disabled}
                          value={value}
                          placeholder={placeholder}
                          onChange={(e) => onChange(e.target.value)}
                          className="w-full pl-9 pr-4 py-3 rounded-xl border border-white/10 bg-white/5 text-white placeholder:text-neutral-200/20 focus:bg-white/10 focus:ring-2 focus:ring-brand-accent/30 focus:border-brand-accent/40 outline-none transition-all disabled:opacity-50 text-sm"
                        />
                      </div>
                    </div>
                  ),
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-200/50 uppercase tracking-wider">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-accent/30"
                      size={16}
                    />
                    <input
                      type="email"
                      readOnly
                      value={profile.email}
                      className="w-full pl-9 pr-10 py-3 rounded-xl border border-white/10 bg-white/5 text-neutral-200/40 outline-none cursor-not-allowed text-sm"
                    />
                    <Lock
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-200/20"
                    />
                  </div>
                </div>
              </div>
              {isEditing && (
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="px-6 py-2.5 bg-brand-blue hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60 text-sm"
                  >
                    {isUpdating ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </form>
          </section>

          {/* KYC Section */}
          <section className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6">
            <div className="flex items-center space-x-2 mb-1">
              <ShieldCheck className="text-brand-accent" size={20} />
              <h3 className="text-lg font-bold text-white">
                Identity Verification
              </h3>
            </div>
            <p className="text-neutral-200/40 text-sm mb-5">
              Complete KYC to unlock full platform features and higher
              transaction limits.
            </p>

            <div className="mb-6 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-neutral-200/60">
                  Verification Progress
                </span>
                <span className="text-brand-accent font-bold">{kyc.progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand-accent to-brand-blue transition-all duration-1000"
                  style={{ width: `${kyc.progress}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { label: 'Unverified', threshold: 33 },
                  { label: 'Basic', threshold: 66 },
                  { label: 'Full', threshold: 100 },
                ].map(({ label, threshold }, i) => (
                  <div
                    key={label}
                    className="flex flex-col items-center space-y-1"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${kyc.progress >= threshold ? 'bg-brand-blue text-white' : 'bg-white/5 text-brand-accent/30 border border-white/10'}`}
                    >
                      {kyc.progress >= threshold ? (
                        <CheckCircle2 size={14} />
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-200/30">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {kyc.level !== 'Full' ? (
              <div className="bg-brand-accent/5 rounded-2xl p-5 border border-brand-accent/10 space-y-5">
                <div className="flex items-start space-x-3">
                  <AlertCircle
                    className="text-brand-accent shrink-0 mt-0.5"
                    size={18}
                  />
                  <div>
                    <h4 className="font-bold text-white text-sm">
                      Action Required
                    </h4>
                    <p className="text-xs text-neutral-200/40 mt-1 leading-relaxed">
                      To reach{' '}
                      <strong className="text-white">
                        {kyc.level === 'Unverified' ? 'Basic' : 'Full'}
                      </strong>{' '}
                      level, upload a valid Government-issued ID and proof of
                      address.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Uploader
                    label="Government ID"
                    description="Upload Passport or Driver License"
                    onFilesSelected={(files) => console.log('ID Files:', files)}
                  />
                  <Uploader
                    label="Proof of Address"
                    description="Utility Bill or Bank Statement"
                    onFilesSelected={(files) =>
                      console.log('Address Files:', files)
                    }
                  />
                </div>
                <button className="w-full py-3 bg-brand-blue hover:bg-brand-blue-dark text-white font-bold rounded-2xl transition-all flex items-center justify-center space-x-2 active:scale-[0.98] text-sm">
                  <span>Submit for Verification</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            ) : (
              <div className="bg-emerald-500/10 rounded-2xl p-5 border border-emerald-500/20 flex items-center space-x-4">
                <div className="w-11 h-11 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-white">
                    Account Fully Verified
                  </h4>
                  <p className="text-xs text-emerald-400/70 mt-0.5">
                    You have full access to all Arbitra services and high
                    transaction limits.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
