import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { NotificationTray } from './NotificationTray';
import { Notification } from '../models/notifications/Notification';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockNotifications = [
  new Notification({
    id: 'notif-1',
    userId: 'user-1',
    eventType: 'new_message',
    payload: { message_id: 'msg-1' },
    isRead: false,
    createdAt: new Date().toISOString(),
  }),
  new Notification({
    id: 'notif-2',
    userId: 'user-1',
    eventType: 'offer_accepted',
    payload: { offer_id: 'off-1' },
    isRead: true,
    createdAt: new Date().toISOString(),
  }),
];

describe('NotificationTray', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    notifications: mockNotifications,
    unreadCount: 1,
    onMarkRead: vi.fn(),
    onMarkAllRead: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(
      <MemoryRouter>
        <NotificationTray {...defaultProps} isOpen={false} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('renders header and unread count', () => {
    render(
      <MemoryRouter>
        <NotificationTray {...defaultProps} />
      </MemoryRouter>
    );
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('1 unread')).toBeInTheDocument();
  });

  it('renders list of notifications with messages', () => {
    render(
      <MemoryRouter>
        <NotificationTray {...defaultProps} />
      </MemoryRouter>
    );
    expect(screen.getByText('You have a new message.')).toBeInTheDocument();
    expect(screen.getByText(/Your proposal has been accepted/i)).toBeInTheDocument();
  });

  it('shows empty state when notifications list is empty', () => {
    render(
      <MemoryRouter>
        <NotificationTray {...defaultProps} notifications={[]} unreadCount={0} />
      </MemoryRouter>
    );
    expect(screen.getByText('Inbox is clean')).toBeInTheDocument();
    expect(screen.getByText('No recent activity to show')).toBeInTheDocument();
  });

  it('calls onMarkAllRead when Mark all read is clicked', async () => {
    const onMarkAllRead = vi.fn();
    render(
      <MemoryRouter>
        <NotificationTray {...defaultProps} onMarkAllRead={onMarkAllRead} />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText('Mark all read'));
    expect(onMarkAllRead).toHaveBeenCalledOnce();
  });

  it('handles clicking notification: marks read, closes, and navigates', async () => {
    const onMarkRead = vi.fn();
    const onClose = vi.fn();
    render(
      <MemoryRouter>
        <NotificationTray
          {...defaultProps}
          onMarkRead={onMarkRead}
          onClose={onClose}
        />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByText('You have a new message.'));
    expect(onMarkRead).toHaveBeenCalledWith('notif-1');
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/messages');
  });
});
