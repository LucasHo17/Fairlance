export type NotificationEventType =
  | 'offer_received'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'new_message'
  | 'review_posted'
  | 'offer_expiring'
  | 'transaction_completed';

export class Notification {
  id: string;
  userId: string;
  eventType: NotificationEventType;
  payload: Record<string, any>;
  isRead: boolean;
  createdAt: string;

  constructor(data: {
    id: string;
    userId: string;
    eventType: NotificationEventType;
    payload: Record<string, any>;
    isRead: boolean;
    createdAt: string;
  }) {
    this.id = data.id;
    this.userId = data.userId;
    this.eventType = data.eventType;
    this.payload = data.payload ?? {};
    this.isRead = data.isRead;
    this.createdAt = data.createdAt;
  }

  static fromRow(row: Record<string, unknown>): Notification {
    return new Notification({
      id: row.id as string,
      userId: row.user_id as string,
      eventType: row.event_type as NotificationEventType,
      payload: (row.payload as Record<string, any>) ?? {},
      isRead: row.is_read as boolean,
      createdAt: row.created_at as string,
    });
  }

  get message(): string {
    switch (this.eventType) {
      case 'offer_received':
        return 'You have received a new proposal or counter-offer!';
      case 'offer_accepted':
        return 'Your proposal has been accepted! A transaction is now active.';
      case 'offer_rejected':
        return 'Your proposal was rejected.';
      case 'new_message':
        return 'You have a new message.';
      case 'review_posted':
        return 'A client has posted a review for your completed work!';
      case 'offer_expiring':
        return 'A pending offer is expiring soon. Click to review it.';
      case 'transaction_completed':
        return 'Your transaction has been marked as complete!';
      default:
        return 'You have a new update.';
    }
  }

  get linkPath(): string {
    switch (this.eventType) {
      case 'offer_received':
      case 'offer_expiring':
        return '/dashboard?tab=offers';
      case 'offer_accepted':
      case 'offer_rejected':
        return '/transactions';
      case 'new_message':
        return '/messages';
      case 'review_posted':
        return '/dashboard';
      case 'transaction_completed':
        return '/transactions';
      default:
        return '/';
    }
  }
}
