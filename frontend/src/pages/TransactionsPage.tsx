import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  Clock,
  DollarSign,
  Star,
  AlertCircle,
  ReceiptText,
  ArrowLeft,
} from 'lucide-react';
import { Transaction } from '../models/marketplace/Marketplace';
import { TransactionRepository } from '../services/repositories/Repositories';
import { CustomerUser } from '../models/users/UserSubclasses';
import { NotificationService } from '../services/repositories/CoreServices';
import { cn } from '../lib/utils';

interface TransactionsPageProps {
  user: { id: string; name: string; role: string };
  onBack: () => void;
}

type TabFilter = 'all' | 'in-progress' | 'completed';

// ── Status badge ──────────────────────────────────────────────
const StatusBadge = ({ complete }: { complete: boolean }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest border-2 border-black',
      complete
        ? 'bg-shadow-grey text-white'
        : 'bg-vibrant-coral text-white',
    )}
  >
    {complete ? <CheckCircle2 size={10} /> : <Clock size={10} />}
    {complete ? 'Completed' : 'In Progress'}
  </span>
);

// ── Review Modal ──────────────────────────────────────────────
const ReviewModal = ({ tx, userId, onClose, onSubmit }: {
  tx: Transaction;
  userId: string;
  onClose: () => void;
  onSubmit: () => void;
}) => {
  const [communication, setCommunication] = useState(0);
  const [quality, setQuality] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const StarInput = ({ label, value, onChange }: any) => (
    <div className="flex items-center justify-between">
      <label className="font-mono text-[10px] uppercase tracking-widest">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className={cn("hover:text-vibrant-coral transition-colors", star <= value ? "text-vibrant-coral" : "text-black/20")}
          >
            <Star size={20} className={star <= value ? "fill-current" : ""} />
          </button>
        ))}
      </div>
    </div>
  );

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!communication || !quality || !speed) {
      setError('Please provide all ratings.');
      return;
    }
    if (!body.trim()) {
      setError('Please write a review text.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const customer = new CustomerUser({ id: userId, role: 'customer' } as any);
      await customer.writeReview({
        transactionId: tx.id,
        ratings: { communication, quality, speed },
        body: body.trim()
      });
      onSubmit();
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.form
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-bone border-4 border-black shadow-brutal w-full max-w-md p-8 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-1">Leave a Review</div>
        <h2 className="font-display uppercase text-2xl tracking-tighter mb-6 truncate">{tx.listingTitle}</h2>

        <div className="space-y-6">
          <div className="space-y-3 border-2 border-black bg-white p-4">
            <StarInput label="Communication" value={communication} onChange={setCommunication} />
            <StarInput label="Quality of Work" value={quality} onChange={setQuality} />
            <StarInput label="Speed & Delivery" value={speed} onChange={setSpeed} />
          </div>
          
          <div>
            <label className="font-display uppercase text-[10px] tracking-widest block mb-1">Written Review</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={4}
              placeholder="Share your experience working with this freelancer..."
              className="w-full border-2 border-black bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:border-vibrant-coral resize-none"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 font-mono text-xs text-vibrant-coral border-2 border-vibrant-coral px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 border-2 border-black font-display uppercase text-sm hover:bg-black hover:text-white transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 py-3 bg-shadow-grey text-white border-2 border-black font-display uppercase text-sm shadow-brutal-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50">
            {loading ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
};

// ── Transaction Card ──────────────────────────────────────────
const TransactionCard = ({
  tx,
  userId,
  onMarkComplete,
  onLeaveReview,
}: {
  tx: Transaction;
  userId: string;
  onMarkComplete: (tx: Transaction) => Promise<void>;
  onLeaveReview: (tx: Transaction) => void;
}) => {
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');
  const isCustomer = tx.customerId === userId;
  const canComplete = isCustomer && !tx.isComplete;

  const handleComplete = async () => {
    setMarking(true);
    setError('');
    try {
      await onMarkComplete(tx);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to mark complete. Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const date = tx.completedAt
    ? new Date(tx.completedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'border-4 border-black bg-white shadow-brutal-sm p-6',
        tx.isComplete && 'opacity-80',
      )}
    >
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        {/* Left: listing + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <StatusBadge complete={tx.isComplete} />
            <span className="font-mono text-[10px] uppercase opacity-40">{date}</span>
          </div>

          <h3 className="font-display uppercase text-xl tracking-tighter leading-tight mt-2 truncate">
            {tx.listingTitle ?? 'Service'}
          </h3>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3">
            <div className="font-mono text-[10px] uppercase opacity-50">Freelancer</div>
            <div className="font-mono text-[10px] uppercase opacity-50">Customer</div>
            <div className="font-mono text-sm truncate">{tx.freelancerName ?? tx.freelancerId.slice(0, 8) + '…'}</div>
            <div className="font-mono text-sm truncate">{tx.customerName ?? tx.customerId.slice(0, 8) + '…'}</div>
          </div>
        </div>

        {/* Right: price + actions */}
        <div className="flex flex-col items-end gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <DollarSign size={16} className="opacity-40" />
            <span className="font-display text-3xl tracking-tighter text-vibrant-coral">
              {Number(tx.finalPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>

          {canComplete && (
            <button
              id={`mark-complete-${tx.id}`}
              onClick={handleComplete}
              disabled={marking}
              className="flex items-center gap-2 px-4 py-2 bg-vibrant-coral text-white border-2 border-black font-display uppercase text-sm shadow-brutal-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <CheckCircle2 size={14} />
              {marking ? 'Marking…' : 'Mark Complete'}
            </button>
          )}

          {tx.isComplete && isCustomer && !tx.hasReview && (
            <button
              onClick={() => onLeaveReview(tx)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black border-2 border-black font-display uppercase text-sm shadow-brutal-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
            >
              <Star size={14} className="fill-current" />
              Leave a Review
            </button>
          )}

          {tx.isComplete && isCustomer && tx.hasReview && (
            <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase opacity-50">
              <Star size={10} className="fill-current text-vibrant-coral" />
              Reviewed
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-rosy-copper font-mono text-xs border-2 border-rosy-copper px-3 py-2">
          <AlertCircle size={12} />
          {error}
        </div>
      )}
    </motion.div>
  );
};

// ── Main page ─────────────────────────────────────────────────

export const TransactionsPage = ({ user, onBack }: TransactionsPageProps) => {
  const repo = useMemo(() => new TransactionRepository(), []);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [filter, setFilter] = useState<TabFilter>('all');
  const [reviewingTx, setReviewingTx] = useState<Transaction | null>(null);

  const fetchTransactions = useCallback(async () => {
    if (!user.id) return;
    setLoading(true);
    setFetchError('');
    try {
      const data = await repo.getByUserEnriched(user.id);
      setTransactions(data);
    } catch (e: any) {
      setFetchError(e?.message ?? 'Failed to load transactions.');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  const handleMarkComplete = async (tx: Transaction) => {
    await tx.markComplete();
    // Optimistically update local state — no need to refetch.
    setTransactions(prev =>
      prev.map(t => t.id === tx.id ? tx : t)
    );
    // Notify the freelancer that the job is done.
    try {
      await NotificationService.notifyTransactionCompleted(tx.id, tx.freelancerId);
    } catch (notifyErr) {
      console.error('Failed to send transaction completion notification:', notifyErr);
    }
  };

  const handleReviewSubmit = () => {
    if (reviewingTx) {
      setTransactions(prev =>
        prev.map(t => t.id === reviewingTx.id ? Object.assign(Object.create(Object.getPrototypeOf(t)), t, { hasReview: true }) : t)
      );
      // Notify the freelancer that a review was posted.
      NotificationService.notifyReviewPosted(reviewingTx.id, reviewingTx.freelancerId)
        .catch(err => console.error('Failed to send review notification:', err));
    }
    setReviewingTx(null);
  };

  const filtered = transactions.filter(tx => {
    if (filter === 'in-progress') return !tx.isComplete;
    if (filter === 'completed')   return tx.isComplete;
    return true;
  });

  const completedCount   = transactions.filter(t => t.isComplete).length;
  const inProgressCount  = transactions.filter(t => !t.isComplete).length;
  const totalValue       = transactions.reduce((acc, t) => acc + Number(t.finalPrice), 0);

  const TABS: { key: TabFilter; label: string; count: number }[] = [
    { key: 'all',         label: 'All',         count: transactions.length },
    { key: 'in-progress', label: 'In Progress',  count: inProgressCount },
    { key: 'completed',   label: 'Completed',    count: completedCount },
  ];

  return (
    <main className="flex-1 bg-bone">
      {/* ── Header ── */}
      <div className="border-b-4 border-black bg-shadow-grey text-white px-8 py-10">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={onBack}
            className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity mb-4"
          >
            <ArrowLeft size={12} /> Back to Profile
          </button>
          <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-2">
            Transactions
          </div>
          <h1 className="font-display uppercase text-4xl md:text-5xl tracking-tighter">
            Transaction History
          </h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-10 space-y-8">
        {/* ── Summary stats ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Transactions', value: transactions.length },
            { label: 'In Progress',        value: inProgressCount, accent: inProgressCount > 0 },
            { label: 'Total Value',        value: `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` },
          ].map(({ label, value, accent }) => (
            <div
              key={label}
              className={cn(
                'border-4 border-black p-5 flex flex-col gap-1',
                accent ? 'bg-vibrant-coral text-white' : 'bg-white',
              )}
            >
              <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">{label}</div>
              <div className="font-display text-3xl tracking-tighter">{value}</div>
            </div>
          ))}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-0 border-4 border-black w-fit">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              id={`tab-${key}`}
              onClick={() => setFilter(key)}
              className={cn(
                'px-5 py-2 font-display uppercase text-sm tracking-tight transition-colors',
                filter === key
                  ? 'bg-shadow-grey text-white'
                  : 'bg-white hover:bg-black/5',
              )}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="border-4 border-black bg-white p-6 h-32 animate-pulse opacity-30"
              />
            ))}
          </div>
        ) : fetchError ? (
          <div className="border-4 border-rosy-copper bg-white p-8 flex items-center gap-4">
            <AlertCircle size={24} className="text-rosy-copper shrink-0" />
            <div>
              <div className="font-display uppercase text-lg tracking-tighter">
                Failed to load transactions
              </div>
              <div className="font-mono text-sm opacity-60 mt-1">{fetchError}</div>
              <button
                onClick={fetchTransactions}
                className="mt-3 font-mono text-xs uppercase underline hover:no-underline"
              >
                Try again
              </button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="border-4 border-dashed border-black/20 p-14 text-center">
            <ReceiptText size={36} className="mx-auto opacity-20 mb-4" />
            <div className="font-display uppercase text-2xl opacity-30 mb-1">
              {filter === 'all' ? 'No transactions yet' : `No ${filter} transactions`}
            </div>
            <div className="font-mono text-xs uppercase opacity-30">
              {filter === 'all'
                ? 'Accepted offers will appear here.'
                : 'Switch to "All" to see everything.'}
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <motion.div layout className="space-y-4">
              {filtered.map(tx => (
                <TransactionCard
                  key={tx.id}
                  tx={tx}
                  userId={user.id}
                  onMarkComplete={handleMarkComplete}
                  onLeaveReview={setReviewingTx}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      <AnimatePresence>
        {reviewingTx && (
          <ReviewModal
            tx={reviewingTx}
            userId={user.id}
            onClose={() => setReviewingTx(null)}
            onSubmit={handleReviewSubmit}
          />
        )}
      </AnimatePresence>
    </main>
  );
};
