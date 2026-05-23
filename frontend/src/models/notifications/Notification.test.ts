import { describe, it, expect } from 'vitest';
import { Notification } from './Notification';

describe('Notification', () => {
  const row = {
    id: 'notif-1',
    user_id: 'user-123',
    event_type: 'offer_received',
    payload: { offer_id: 'offer-555' },
    is_read: false,
    created_at: '2026-05-23T00:00:00Z',
  };

  it('hydrates correctly from a database row', () => {
    const notif = Notification.fromRow(row);
    expect(notif).toBeInstanceOf(Notification);
    expect(notif.id).toBe('notif-1');
    expect(notif.userId).toBe('user-123');
    expect(notif.eventType).toBe('offer_received');
    expect(notif.payload).toEqual({ offer_id: 'offer-555' });
    expect(notif.isRead).toBe(false);
    expect(notif.createdAt).toBe('2026-05-23T00:00:00Z');
  });

  it('provides correct user-friendly messages for each event type', () => {
    const offerReceived = Notification.fromRow(row);
    expect(offerReceived.message).toContain('received a new proposal');
    expect(offerReceived.linkPath).toBe('/dashboard?tab=offers');

    const offerAccepted = Notification.fromRow({ ...row, event_type: 'offer_accepted' });
    expect(offerAccepted.message).toContain('proposal has been accepted');
    expect(offerAccepted.linkPath).toBe('/transactions');

    const offerRejected = Notification.fromRow({ ...row, event_type: 'offer_rejected' });
    expect(offerRejected.message).toContain('proposal was rejected');
    expect(offerRejected.linkPath).toBe('/transactions');

    const newMessage = Notification.fromRow({ ...row, event_type: 'new_message' });
    expect(newMessage.message).toContain('new message');
    expect(newMessage.linkPath).toBe('/messages');

    const reviewPosted = Notification.fromRow({ ...row, event_type: 'review_posted' });
    expect(reviewPosted.message).toContain('posted a review');
    expect(reviewPosted.linkPath).toBe('/dashboard');

    const offerExpiring = Notification.fromRow({ ...row, event_type: 'offer_expiring' });
    expect(offerExpiring.message).toContain('expiring soon');
    expect(offerExpiring.linkPath).toBe('/dashboard?tab=offers');
  });

  it('handles default messaging for unknown events', () => {
    const unknownNotif = Notification.fromRow({ ...row, event_type: 'something_else' });
    expect(unknownNotif.message).toBe('You have a new update.');
    expect(unknownNotif.linkPath).toBe('/');
  });
});
