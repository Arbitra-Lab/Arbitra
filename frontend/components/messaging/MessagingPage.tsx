'use client';

import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import ConversationList from './ConversationList';
import MessageComposer from './MessageComposer';
import MessageThread from './MessageThread';
import { useMessaging } from './useMessaging';

export default function MessagingPage() {
  const currentUser = useAuthStore((s) => s.user);
  const {
    conversations,
    messages,
    activeConversation,
    activeId,
    setActiveId,
    typing,
    status,
    loading,
    uploading,
    error,
    notifyTyping,
    sendMessage,
  } = useMessaging();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Messages</h1>
        <p className="mt-1 text-sm text-neutral-200/60">
          Chat with landlords, tenants and arbiters in real time.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-xl border border-brand-blue/30 bg-brand-blue/10 px-4 py-3 text-sm text-white"
        >
          <AlertCircle size={16} className="shrink-0 text-brand-blue" />
          {error}
        </div>
      )}

      <div className="flex h-[70vh] min-h-[30rem] overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-xl backdrop-blur-sm">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          loading={loading}
          status={status}
          hiddenOnMobile={Boolean(activeId)}
        />
        <div
          className={`${activeId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}
        >
          <MessageThread
            conversation={activeConversation}
            messages={messages}
            typing={typing}
            currentUserId={currentUser?.id ?? ''}
            onBack={() => setActiveId(null)}
          />
          <MessageComposer
            disabled={!activeId}
            uploading={uploading}
            onSend={sendMessage}
            onTyping={notifyTyping}
          />
        </div>
      </div>
    </div>
  );
}
