import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import { Notification } from '../models/notifications/Notification';
import { NotificationRepository } from '../services/repositories/Repositories';
import { supabase } from '../lib/supabaseClient';

const mockGetByUser = vi.fn();
const mockMarkAsRead = vi.fn();
const mockMarkAllAsRead = vi.fn();

vi.mock('../lib/supabaseClient', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return {
    supabase: {
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('../services/repositories/Repositories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/repositories/Repositories')>();
  const MockNotificationRepository = vi.fn().mockImplementation(function (this: any) {
    this.getByUser = mockGetByUser;
    this.markAsRead = mockMarkAsRead;
    this.markAllAsRead = mockMarkAllAsRead;
  });
  return {
    ...actual,
    NotificationRepository: MockNotificationRepository,
  };
});

describe('useNotifications hook', () => {
  const notifs = [
    new Notification({
      id: 'notif-1',
      userId: 'user-1',
      eventType: 'new_message',
      payload: {},
      isRead: false,
      createdAt: new Date().toISOString(),
    }),
    new Notification({
      id: 'notif-2',
      userId: 'user-1',
      eventType: 'offer_accepted',
      payload: {},
      isRead: true,
      createdAt: new Date().toISOString(),
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetByUser.mockResolvedValue(notifs);
  });

  it('fetches notifications on mount for a given userId', async () => {
    const { result } = renderHook(() => useNotifications('user-1'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetByUser).toHaveBeenCalledWith('user-1');
    expect(result.current.notifications).toHaveLength(2);
    expect(result.current.unreadCount).toBe(1);
  });

  it('handles empty states when no userId is provided', async () => {
    const { result } = renderHook(() => useNotifications(undefined));

    expect(result.current.loading).toBe(false);
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
    expect(mockGetByUser).not.toHaveBeenCalled();
  });

  it('marks a notification as read and updates state optimistically', async () => {
    const { result } = renderHook(() => useNotifications('user-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.markAsRead('notif-1');
    });

    expect(result.current.notifications[0].isRead).toBe(true);
    expect(result.current.unreadCount).toBe(0);
    expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1');
  });

  it('marks all notifications as read and updates state optimistically', async () => {
    const { result } = renderHook(() => useNotifications('user-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.markAllAsRead();
    });

    expect(result.current.notifications[0].isRead).toBe(true);
    expect(result.current.notifications[1].isRead).toBe(true);
    expect(result.current.unreadCount).toBe(0);
    expect(mockMarkAllAsRead).toHaveBeenCalledWith('user-1');
  });
});
