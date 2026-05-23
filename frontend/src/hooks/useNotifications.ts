import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Notification } from '../models/notifications/Notification';
import { NotificationRepository } from '../services/repositories/Repositories';

export function useNotifications(userId: string | undefined) {
  const repo = useMemo(() => new NotificationRepository(), []);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await repo.getByUser(userId);
      setNotifications(data);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [userId, repo]);

  const markAsRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? new Notification({ ...n, isRead: true }) : n))
    );
    try {
      await repo.markAsRead(id);
    } catch (err) {
      // Revert if error
      fetchNotifications();
    }
  }, [repo, fetchNotifications]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => new Notification({ ...n, isRead: true }))
    );
    try {
      await repo.markAllAsRead(userId);
    } catch (err) {
      // Revert if error
      fetchNotifications();
    }
  }, [userId, repo, fetchNotifications]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Fetch initial notifications
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to real-time changes
  useEffect(() => {
    if (!userId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    let isInitialSub = true;

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newNotif = Notification.fromRow(payload.new as Record<string, unknown>);
            setNotifications((prev) => {
              if (prev.some((n) => n.id === newNotif.id)) return prev;
              return [newNotif, ...prev];
            });

            // Trigger a toast popup
            setToasts((prev) => [...prev, newNotif]);

            // Auto-dismiss toast after 4 seconds
            setTimeout(() => {
              dismissToast(newNotif.id);
            }, 4000);
          } else if (payload.eventType === 'UPDATE') {
            const updatedNotif = Notification.fromRow(payload.new as Record<string, unknown>);
            setNotifications((prev) =>
              prev.map((n) => (n.id === updatedNotif.id ? updatedNotif : n))
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any).id;
            setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (!isInitialSub) {
            // Reconnected! Re-fetch notifications to catch up on any missed updates during downtime
            fetchNotifications();
          } else {
            isInitialSub = false;
          }
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [userId, dismissToast]);

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.isRead).length;
  }, [notifications]);

  return {
    notifications,
    loading,
    error,
    toasts,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismissToast,
    refetch: fetchNotifications,
  };
}
