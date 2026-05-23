import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNotifications } from '../hooks/useNotifications';
import { NotificationTray } from './NotificationTray';

interface NavbarProps {
  user?: any | null;
}

export const Navbar = ({ user }: NavbarProps) => {
  const navigate = useNavigate();
  const [isTrayOpen, setIsTrayOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    toasts,
    dismissToast,
  } = useNotifications(user?.id);

  return (
    <nav className="flex justify-between items-center px-8 py-6 border-b-4 border-black bg-white select-none relative">
      <Link
        to="/"
        className="text-3xl font-display uppercase tracking-tighter flex items-center gap-2"
      >
        <div className="w-8 h-8 bg-vibrant-coral border-2 border-black rounded-sm" />
        Fairlance
      </Link>
      <div className="hidden md:flex gap-8 font-display uppercase text-sm tracking-widest">
        <Link to="/find-talent" className="hover:text-vibrant-coral transition-colors">Find Talent</Link>
        <Link to="/how-it-works" className="hover:text-vibrant-coral transition-colors">How it works</Link>
        <Link to="/pricing" className="hover:text-vibrant-coral transition-colors">Pricing</Link>
      </div>
      {user ? (
        <div className="flex items-center gap-4">
          <Link
            to="/transactions"
            className="hidden sm:block font-display uppercase text-sm tracking-widest hover:text-vibrant-coral transition-colors"
          >
            Transactions
          </Link>
          <Link
            to="/messages"
            className="hidden sm:block font-display uppercase text-sm tracking-widest hover:text-vibrant-coral transition-colors"
          >
            Messages
          </Link>

          {/* Real-time Notification Bell */}
          <div className="relative flex items-center">
            <button
              onClick={() => setIsTrayOpen(!isTrayOpen)}
              className="p-2 border-2 border-black bg-white hover:bg-black/5 cursor-pointer relative shadow-brutal-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              aria-label="Notifications"
              id="notification-bell-btn"
            >
              <Bell size={18} className="text-shadow-grey" />
              {unreadCount > 0 && (
                <div 
                  id="notification-badge"
                  className="absolute -top-2.5 -right-2.5 min-w-5 h-5 px-1 flex items-center justify-center bg-vibrant-coral text-white font-mono text-[9px] uppercase font-bold border-2 border-black rounded-full shadow-brutal-sm animate-bounce"
                >
                  {unreadCount}
                </div>
              )}
            </button>
            <NotificationTray
              isOpen={isTrayOpen}
              onClose={() => setIsTrayOpen(false)}
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={markAsRead}
              onMarkAllRead={markAllAllRead => markAllAsRead()}
            />
          </div>

          <div
            onClick={() => navigate(user.role === 'freelancer' ? '/dashboard' : '/profile')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="text-right hidden sm:block">
              <div className="font-display uppercase text-sm font-bold group-hover:text-vibrant-coral transition-colors leading-none">{user.name}</div>
              <div className="text-[10px] font-mono uppercase opacity-60 mt-1.5">{user.role}</div>
            </div>
            <div className="w-10 h-10 bg-shadow-grey text-white font-display text-xl uppercase border-2 border-black shadow-brutal-sm group-hover:translate-x-1 group-hover:translate-y-1 group-hover:shadow-none transition-all flex items-center justify-center relative">
              {user.name.charAt(0)}
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-vibrant-coral border-2 border-black rounded-sm" />
            </div>
          </div>
        </div>
      ) : (
        <Link
          to="/auth"
          className="px-6 py-2 bg-shadow-grey text-white font-display uppercase text-sm border-2 border-black shadow-brutal-sm hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
        >
          Login
        </Link>
      )}

      {/* Floating Toast Notification Area */}
      <div className="fixed top-24 right-8 z-50 flex flex-col gap-3 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              onClick={() => {
                markAsRead(toast.id);
                dismissToast(toast.id);
                navigate(toast.linkPath);
              }}
              className="pointer-events-auto w-80 border-4 border-black bg-white p-4 shadow-brutal flex gap-3 items-start cursor-pointer hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all select-none"
            >
              <div className="w-8 h-8 rounded-sm border-2 border-black flex items-center justify-center bg-bone shrink-0 shadow-brutal-sm">
                <Bell size={16} className="text-vibrant-coral" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="font-display uppercase text-[10px] tracking-widest opacity-60">
                  New Alert
                </div>
                <p className="text-xs font-sans text-shadow-grey leading-tight mt-1">
                  {toast.message}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissToast(toast.id);
                }}
                className="text-shadow-grey/40 hover:text-black font-bold font-mono text-xs cursor-pointer shrink-0"
              >
                ✕
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </nav>
  );
};
