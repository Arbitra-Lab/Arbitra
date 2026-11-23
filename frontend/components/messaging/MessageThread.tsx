'use client';

import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Paperclip,
} from 'lucide-react';
import type { Conversation, Message, TypingState } from './types';

interface MessageThreadProps {
  conversation: Conversation | null;
  messages: Message[];
  typing: TypingState | null;
  currentUserId: string;
  onBack: () => void;
}

export default function MessageThread({
  conversation,
  messages,
  typing,
  currentUserId,
  onBack,
}: MessageThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typing]);

  if (!conversation) {
    return (
      <section className="flex min-h-60 flex-1 items-center justify-center text-center text-sm text-neutral-200/50">
        Select a conversation to start messaging.
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-white/10 bg-white/5 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="rounded-lg p-1.5 text-neutral-200/70 hover:bg-white/10 hover:text-white cursor-pointer md:hidden"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="flex size-9 items-center justify-center rounded-full bg-brand-accent/20 text-sm font-semibold text-brand-accent">
          {conversation.name
            .split(' ')
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('')}
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-white">
            {conversation.name}
          </h2>
          <p className="text-xs text-neutral-200/50">Direct message</p>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-200/40">
            Start the conversation
          </p>
        )}

        {messages.map((message) => {
          const own = message.senderId === currentUserId;
          return (
            <div
              key={message.id}
              className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[70%] ${
                  own
                    ? 'rounded-br-sm bg-brand-accent/20 text-white'
                    : 'rounded-bl-sm bg-white/10 text-white'
                }`}
              >
                {!own && (
                  <p className="mb-1 text-[11px] font-semibold text-brand-accent">
                    {message.senderName}
                  </p>
                )}
                {message.content && (
                  <p className="whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                )}
                {message.attachments?.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs hover:border-brand-accent/50"
                  >
                    {attachment.mimeType?.startsWith('image/') ? (
                      <Paperclip
                        size={14}
                        className="shrink-0 text-brand-accent"
                      />
                    ) : (
                      <FileText
                        size={14}
                        className="shrink-0 text-brand-accent"
                      />
                    )}
                    <span className="truncate">{attachment.name}</span>
                  </a>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-neutral-200/40">
                <time dateTime={message.createdAt}>
                  {format(new Date(message.createdAt), 'MMM d · h:mm a')}
                </time>
                {own && (
                  <span
                    title={
                      message.read
                        ? 'Read'
                        : message.pending
                          ? 'Sending'
                          : 'Sent'
                    }
                  >
                    {message.pending ? (
                      <Clock size={13} />
                    ) : message.read ? (
                      <CheckCheck size={13} className="text-brand-accent" />
                    ) : (
                      <Check size={13} />
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {typing?.conversationId === conversation.id && (
          <div className="flex items-center gap-2 text-xs text-neutral-200/50">
            <span className="flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-brand-accent [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-brand-accent [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-brand-accent" />
            </span>
            typing...
          </div>
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}
