'use client';

import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Search, MessageSquare, Wifi, WifiOff, Loader2 } from 'lucide-react';
import type { ConnectionStatus, Conversation } from './types';

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  status: ConnectionStatus;
  hiddenOnMobile?: boolean;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function ConversationList({
  conversations,
  activeId,
  onSelect,
  loading,
  status,
  hiddenOnMobile,
}: ConversationListProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return conversations;
    return conversations.filter(
      (room) =>
        room.name.toLowerCase().includes(needle) ||
        room.lastMessage.toLowerCase().includes(needle),
    );
  }, [conversations, query]);

  return (
    <aside
      className={`${
        hiddenOnMobile ? 'hidden md:flex' : 'flex'
      } w-full md:w-80 shrink-0 flex-col border-b md:border-b-0 md:border-r border-white/10 bg-white/5`}
    >
      <div className="p-4 border-b border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">Conversations</h2>
          <span
            className={`inline-flex items-center gap-1.5 text-xs ${
              status === 'connected'
                ? 'text-brand-accent'
                : status === 'connecting'
                  ? 'text-brand-orange'
                  : 'text-neutral-200/50'
            }`}
          >
            {status === 'connected' ? (
              <Wifi size={13} />
            ) : status === 'connecting' ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <WifiOff size={13} />
            )}
            {status === 'connected'
              ? 'Connected'
              : status === 'connecting'
                ? 'Connecting'
                : 'Offline'}
          </span>
        </div>
        <div className="relative">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-200/40"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations..."
            aria-label="Search conversations"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm text-white placeholder:text-neutral-200/40 focus:border-brand-accent focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-200/50">
            <Loader2 size={16} className="animate-spin" />
            Loading conversations...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-neutral-200/50">
            <MessageSquare size={24} className="text-brand-accent/60" />
            {query ? 'No matching conversations' : 'No conversations yet'}
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {filtered.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => onSelect(room.id)}
                  aria-current={activeId === room.id ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                    activeId === room.id
                      ? 'bg-brand-accent/15 border-l-2 border-brand-accent'
                      : 'border-l-2 border-transparent hover:bg-white/5'
                  }`}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/20 text-sm font-semibold text-brand-accent">
                    {initials(room.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {room.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-neutral-200/40">
                        {formatDistanceToNow(new Date(room.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-neutral-200/50">
                        {room.lastMessage || 'No messages yet'}
                      </span>
                      {room.unreadCount > 0 && (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-blue text-[10px] font-bold text-white">
                          {room.unreadCount > 9 ? '9+' : room.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
