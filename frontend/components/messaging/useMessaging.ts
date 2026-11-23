'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { apiClient } from '@/lib/api-client';
import { storageApi } from '@/lib/api/storage';
import { createMessagingConnection } from '@/lib/websocket/messaging-socket';
import { useAuthStore } from '@/store/authStore';
import type {
  ConnectionStatus,
  Conversation,
  Message,
  MessageAttachment,
  TypingState,
} from './types';

function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function asArray<T>(payload: unknown): T[] {
  const value = unwrap<unknown>(payload);
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeConversation(raw: Record<string, unknown>): Conversation {
  return {
    id: String(raw.id ?? raw.chatGroupId ?? ''),
    name: String(raw.name ?? raw.participantName ?? 'Conversation'),
    lastMessage: String(raw.lastMessage ?? raw.content ?? ''),
    unreadCount: Number(raw.unreadCount ?? 0),
    updatedAt: String(
      raw.updatedAt ?? raw.updated_at ?? new Date().toISOString(),
    ),
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : undefined,
  };
}

function normalizeMessage(
  raw: Record<string, unknown>,
  fallbackRoomId: string,
): Message {
  const sender = raw.sender as { name?: string } | undefined;
  const attachments = Array.isArray(raw.attachments)
    ? (raw.attachments as MessageAttachment[])
    : undefined;

  return {
    id: String(raw.id ?? raw.messageId ?? `msg-${Date.now()}-${Math.random()}`),
    roomId: String(raw.roomId ?? raw.chatGroupId ?? fallbackRoomId),
    senderId: String(raw.senderId ?? raw.sender_id ?? ''),
    senderName: String(raw.senderName ?? sender?.name ?? 'Unknown'),
    content: String(raw.content ?? raw.message ?? ''),
    createdAt: String(
      raw.createdAt ?? raw.timestamp ?? new Date().toISOString(),
    ),
    read: Boolean(raw.read ?? raw.isRead ?? false),
    attachments,
  };
}

function appendUnique(list: Message[], message: Message): Message[] {
  if (list.some((item) => item.id === message.id)) return list;
  return [...list, message].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useMessaging() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = user?.id ?? '';

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<string, Message[]>
  >({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [typing, setTyping] = useState<TypingState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
    setTyping(null);
  }, [activeId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiClient
      .get<unknown>(`/messaging/rooms?userId=${encodeURIComponent(userId)}`)
      .then((response) => {
        if (cancelled) return;
        const rooms = asArray<Record<string, unknown>>(response.data).map(
          normalizeConversation,
        );
        setConversations(rooms);
        setActiveId((current) => current ?? rooms[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, 'Unable to load conversations'));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    apiClient
      .get<unknown>(
        `/messaging/rooms/${encodeURIComponent(activeId)}/messages?page=1&limit=50`,
      )
      .then((response) => {
        if (cancelled) return;
        const messages = asArray<Record<string, unknown>>(response.data).map(
          (raw) => normalizeMessage(raw, activeId),
        );
        setMessagesByRoom((prev) => ({ ...prev, [activeId]: messages }));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err, 'Unable to load messages'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !userId) return;
    setConversations((prev) =>
      prev.map((room) =>
        room.id === activeId ? { ...room, unreadCount: 0 } : room,
      ),
    );
    void apiClient
      .patch(
        `/messaging/rooms/${encodeURIComponent(activeId)}/read?userId=${encodeURIComponent(userId)}`,
      )
      .catch(() => undefined);
  }, [activeId, userId]);

  useEffect(() => {
    if (!accessToken || !userId) {
      setStatus('disconnected');
      return;
    }

    const connection = createMessagingConnection(accessToken, userId);
    const socket = connection.socket;
    socketRef.current = socket;

    const onConnect = () => {
      setStatus('connected');
      const roomId = activeIdRef.current;
      if (roomId) socket.emit('join', { chatGroupId: roomId, userId });
    };
    const onDisconnect = () => setStatus('disconnected');
    const onConnectError = () => setStatus('disconnected');

    const onMessage = (raw: unknown) => {
      const payload = raw as Record<string, unknown>;
      const roomId = String(payload.roomId ?? payload.chatGroupId ?? '');
      if (!roomId) return;

      const message = normalizeMessage(payload, roomId);
      setMessagesByRoom((prev) => ({
        ...prev,
        [roomId]: appendUnique(prev[roomId] ?? [], message),
      }));
      setConversations((prev) =>
        prev.map((room) =>
          room.id === roomId
            ? {
                ...room,
                lastMessage:
                  message.content || message.attachments?.[0]?.name || '',
                updatedAt: message.createdAt,
                unreadCount:
                  message.senderId === userId || activeIdRef.current === roomId
                    ? room.unreadCount
                    : room.unreadCount + 1,
              }
            : room,
        ),
      );
    };

    const onTypingStart = (raw: unknown) => {
      const payload = raw as Record<string, unknown>;
      const roomId = String(payload.chatGroupId ?? payload.roomId ?? '');
      if (
        roomId &&
        roomId === activeIdRef.current &&
        payload.userId !== userId
      ) {
        setTyping({ conversationId: roomId, userId: String(payload.userId) });
      }
    };

    const onTypingStop = (raw: unknown) => {
      const payload = raw as Record<string, unknown>;
      const roomId = String(payload.chatGroupId ?? payload.roomId ?? '');
      if (roomId && roomId === activeIdRef.current) setTyping(null);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('message:receive', onMessage);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);

    return () => {
      if (typingTimer.current) clearTimeout(typingTimer.current);
      socketRef.current = null;
      connection.dispose();
    };
  }, [accessToken, userId]);

  const notifyTyping = useCallback(() => {
    const roomId = activeIdRef.current;
    const socket = socketRef.current;
    if (!roomId || !socket) return;

    socket.emit('typing:start', { chatGroupId: roomId, userId });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing:stop', { chatGroupId: roomId, userId });
      typingTimer.current = null;
    }, 1_500);
  }, [userId]);

  const sendMessage = useCallback(
    async (content: string, files: File[]) => {
      const roomId = activeIdRef.current;
      if (!roomId || (!content.trim() && files.length === 0)) return;

      setError(null);
      setUploading(true);
      try {
        const attachments: MessageAttachment[] = await Promise.all(
          files.map(async (file) => {
            const { url, key } = await storageApi.getUploadUrl(
              file.name,
              file.size,
              file.type,
            );
            let previewUrl = URL.createObjectURL(file);
            if (typeof url === 'string' && url) {
              await storageApi.uploadToS3(url, file);
              try {
                previewUrl = await storageApi.getDownloadUrl(key);
              } catch {
                previewUrl = url;
              }
            }
            return {
              id: key || `attachment-${Date.now()}-${file.name}`,
              name: file.name,
              url: previewUrl,
              size: file.size,
              mimeType: file.type,
            };
          }),
        );

        const tempId = `local-${Date.now()}-${Math.random()}`;
        const optimistic: Message = {
          id: tempId,
          roomId,
          senderId: userId,
          senderName: user ? `${user.firstName} ${user.lastName}` : 'You',
          content: content.trim(),
          createdAt: new Date().toISOString(),
          read: false,
          attachments,
          pending: true,
        };

        setMessagesByRoom((prev) => ({
          ...prev,
          [roomId]: appendUnique(prev[roomId] ?? [], optimistic),
        }));
        setConversations((prev) =>
          prev.map((room) =>
            room.id === roomId
              ? {
                  ...room,
                  lastMessage: optimistic.content || attachments[0]?.name || '',
                  updatedAt: optimistic.createdAt,
                }
              : room,
          ),
        );

        const payload = {
          chatGroupId: roomId,
          senderId: userId,
          content: optimistic.content,
          timestamp: optimistic.createdAt,
          attachments,
        };
        const socket = socketRef.current;
        if (!socket?.connected) {
          setMessagesByRoom((prev) => ({
            ...prev,
            [roomId]: (prev[roomId] ?? []).map((message) =>
              message.id === tempId ? { ...message, pending: false } : message,
            ),
          }));
          return;
        }

        socket.emit('message:send', payload, (ack: unknown) => {
          if (!ack || typeof ack !== 'object') return;
          const delivered = normalizeMessage(
            ack as Record<string, unknown>,
            roomId,
          );
          setMessagesByRoom((prev) => ({
            ...prev,
            [roomId]: appendUnique(
              (prev[roomId] ?? []).filter((message) => message.id !== tempId),
              { ...delivered, read: true },
            ),
          }));
        });
      } catch (err: unknown) {
        setError(errorMessage(err, 'Unable to send message'));
        throw err;
      } finally {
        setUploading(false);
      }
    },
    [userId, user],
  );

  const messages = activeId ? (messagesByRoom[activeId] ?? []) : [];
  const activeConversation = useMemo(
    () => conversations.find((room) => room.id === activeId) ?? null,
    [conversations, activeId],
  );

  return {
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
  };
}
