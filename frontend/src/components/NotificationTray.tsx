import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  MessageSquare,
  Handshake,
  CheckCircle2,
  XCircle,
  Star,
  Clock,
  Inbox,
  Check,
} from 'lucide-react';
import { Notification } from '../models/notifications/Notification';
import { cn } from '../lib/utils';

interface NotificationTrayProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'offer_received':
      return <Handshake className="text-vibrant-coral shrink-0" size={16} />;
    case 'offer_accepted':
      return <CheckCircle2 className="text-shadow-grey shrink-0" size={16} />;
    case 'offer_rejected':
      return <XCircle className="text-rosy-copper shrink-0" size={16} />;
    case 'new_message':
      return <MessageSquare className="text-vibrant-coral shrink-0" size={16} />;
    case 'review_posted':
      return <Star className="text-vibrant-coral fill-current shrink-0" size={16} />;
    case 'offer_expiring':
      return <Clock className="text-rosy-copper shrink-0" size={16} />;
    case 'transaction_completed':
      return <CheckCircle2 className="text-shadow-grey shrink-0" size={16} />;
    default:
      return <Inbox className="text-black/50 shrink-0" size={16} />;
  }
};

export const NotificationTray = ({
  isOpen,
  onClose,
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: NotificationTrayProps) => {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleItemClick = (n: Notification) => {
    onMarkRead(n.id);
    onClose();
    navigate(n.linkPath);
  };

  return (
    <>
      {/* Click outside to close backdrop */}
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />

      {/* Floating Brutalist Tray */}
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.95 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="absolute right-0 top-full mt-3 w-80 md:w-96 border-4 border-black bg-white shadow-brutal z-50 flex flex-col max-h-[480px] text-shadow-grey font-sans"
      >
        {/* Header */}
        <div className="p-4 border-b-4 border-black flex justify-between items-center bg-white shrink-0">
          <div>
            <h4 className="font-display uppercase text-lg tracking-tight leading-none">
              Notifications
            </h4>
            {unreadCount > 0 && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-vibrant-coral font-bold mt-1 inline-block">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-shadow-grey/70 hover:text-black font-bold hover:underline transition-all"
            >
              <Check size={10} /> Mark all read
            </button>
          )}
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto divide-y-2 divide-black/10 bg-bone">
          {notifications.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center text-black/40">
              <Inbox size={28} className="opacity-30 mb-2" />
              <div className="font-display uppercase text-sm tracking-tight">
                Inbox is clean
              </div>
              <div className="font-mono text-[9px] uppercase mt-1">
                No recent activity to show
              </div>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleItemClick(notif)}
                className={cn(
                  'p-4 flex gap-3 cursor-pointer hover:bg-black/5 transition-all text-left relative group',
                  !notif.isRead ? 'bg-white' : 'bg-white/60 opacity-80'
                )}
              >
                {/* Pulsating unread dot indicator */}
                {!notif.isRead && (
                  <div className="absolute top-4 right-4 w-2.5 h-2.5 bg-vibrant-coral border border-black rounded-full animate-pulse" />
                )}

                {/* Left side icon block */}
                <div className="w-8 h-8 rounded-sm border-2 border-black flex items-center justify-center bg-bone shrink-0 shadow-brutal-sm group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:shadow-none transition-all">
                  {getNotificationIcon(notif.eventType)}
                </div>

                {/* Text details */}
                <div className="flex-1 min-w-0 pr-4">
                  <p
                    className={cn(
                      'text-xs font-sans leading-tight',
                      !notif.isRead ? 'font-semibold text-shadow-grey' : 'text-shadow-grey/70'
                    )}
                  >
                    {notif.message}
                  </p>
                  <span className="font-mono text-[9px] uppercase opacity-40 mt-1 block">
                    {new Date(notif.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t-2 border-black bg-white flex justify-center shrink-0">
          <button
            onClick={onClose}
            className="w-full py-1 text-center font-mono text-[10px] uppercase hover:bg-black hover:text-white transition-colors border border-transparent hover:border-black font-semibold"
          >
            Collapse Panel
          </button>
        </div>
      </motion.div>
    </>
  );
};
