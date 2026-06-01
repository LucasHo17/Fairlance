import { useState, useEffect, type ElementType, type FormEvent } from 'react';
import { Plus, ToggleLeft, ToggleRight, CheckCircle, XCircle, Clock, DollarSign, Briefcase, TrendingUp, Eye, Trash2, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { ServiceListing, Offer } from '../models/marketplace/Marketplace';
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal';
import { cn } from '../lib/utils';
import { OfferCard } from '../components/OfferCard';
import { mlServiceClient } from '../services/repositories/CoreServices';
import { PricingReportModal } from '../components/PricingReportModal';
import { getPricingReport } from '../data/mockData';

interface FreelancerDashboardProps {
  user: { id?: string; name: string; email: string };
  onLogout: () => void;
  onSwitchToClient: () => void;
  onViewTransactions: () => void;
}

// ── Stat Card ─────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, accent }: {
  icon: ElementType;
  label: string;
  value: string | number;
  accent?: boolean;
}) => (
  <div className={cn(
    'border-4 border-black p-6 flex flex-col gap-2',
    accent ? 'bg-vibrant-coral text-white' : 'bg-white'
  )}>
    <Icon size={20} className="opacity-60" />
    <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">{label}</div>
    <div className="font-display text-3xl tracking-tighter">{value}</div>
  </div>
);

// ── Listing Card ──────────────────────────────────────────────
const ListingCard = ({
  listing,
  onToggle,
  onView,
  onEdit,
  onDelete,
  onOpenReport,
}: {
  listing: ServiceListing;
  onToggle: (l: ServiceListing) => void | Promise<void>;
  onView: (l: ServiceListing) => void;
  onEdit: (l: ServiceListing) => void;
  onDelete: (l: ServiceListing) => void;
  onOpenReport: (l: ServiceListing) => void;
}) => (
  <motion.div
    layout
    className={cn(
      'border-4 border-black p-5 bg-white shadow-brutal-sm flex flex-col',
      !listing.isActive && 'opacity-50'
    )}
  >
    <div className="flex items-start justify-between gap-4 flex-1">
      <div className="flex-1 min-w-0">
        <div className="font-display uppercase text-lg tracking-tighter leading-tight truncate">
          {listing.title}
        </div>
        <div className="font-mono text-[10px] uppercase opacity-50 mt-1">
          {listing.isActive ? 'Active' : 'Inactive'} · Created {new Date(listing.createdAt).toLocaleDateString()}
        </div>
        <p className="text-sm opacity-70 mt-2 line-clamp-2">{listing.description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onView(listing)}
          className="text-black/60 hover:text-black transition-colors"
          title="Preview listing"
        >
          <Eye size={20} />
        </button>
        <button
          onClick={() => onEdit(listing)}
          className="text-black/60 hover:text-black transition-colors"
          title="Edit listing"
        >
          <Pencil size={20} />
        </button>
        <button
          onClick={() => onDelete(listing)}
          className="text-rosy-copper/60 hover:text-rosy-copper transition-colors"
          title="Delete listing"
        >
          <Trash2 size={20} />
        </button>
        <button
          onClick={() => onToggle(listing)}
          className="text-black/60 hover:text-black transition-colors"
          title={listing.isActive ? 'Deactivate' : 'Activate'}
        >
          {listing.isActive
            ? <ToggleRight size={32} className="text-vibrant-coral" />
            : <ToggleLeft size={32} />}
        </button>
      </div>
    </div>

    <button
      onClick={() => onOpenReport(listing)}
      className="mt-4 w-full py-2 bg-white text-black font-mono uppercase text-xs border-2 border-black flex items-center justify-center gap-2 hover:bg-black hover:text-white transition-all shadow-brutal-xs hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
    >
      <TrendingUp size={14} className="text-vibrant-coral" /> Price Competitor Report
    </button>
  </motion.div>
);

// ── New Listing Modal ─────────────────────────────────────────
const NewListingModal = ({
  freelancerId,
  onCreated,
  onClose,
}: {
  freelancerId: string;
  onCreated: () => void;
  onClose: () => void;
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [pricingModels, setPricingModels] = useState<PricingModelRow[]>([{ strategy_type: 'hourly', base_price: 0 }]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [zipCode, setZipCode] = useState('');
  const [avgRating, setAvgRating] = useState(4.5);
  const [prediction, setPrediction] = useState<{ minPrice: number; maxPrice: number; suggestedPrice: number } | null>(null);
  const [fetchingPrediction, setFetchingPrediction] = useState(false);

  const [categorization, setCategorization] = useState<{ match: boolean; confidence: number } | null>(null);
  const [checkingCategorization, setCheckingCategorization] = useState(false);

  useEffect(() => {
    if (!description || !categoryId) {
      setCategorization(null);
      return;
    }

    const categoryName = categories.find(c => c.id === categoryId)?.name || '';
    const categorySlug = categoryName.toLowerCase().trim().replace(/\s+/g, '-');

    setCheckingCategorization(true);

    const timer = setTimeout(async () => {
      try {
        const res = await mlServiceClient.categorizeService({
          description: description,
          claimedCategory: categorySlug,
        });
        if (res) {
          setCategorization(res);
        } else {
          setCategorization(null);
        }
      } catch (err) {
        console.error('Categorization check error:', err);
        setCategorization(null);
      } finally {
        setCheckingCategorization(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [description, categoryId, categories]);

  useEffect(() => {
    supabase.from('categories').select('id, name').order('name').then(({ data }) => {
      if (data) setCategories(data);
    });

    if (freelancerId) {
      supabase.from('users').select('zip_code').eq('id', freelancerId).single().then(({ data }) => {
        if (data?.zip_code) setZipCode(data.zip_code);
      });
      supabase.from('freelancer_rating_aggregates').select('avg_overall').eq('freelancer_id', freelancerId).maybeSingle().then(({ data }) => {
        if (data?.avg_overall) setAvgRating(data.avg_overall);
      });
    }
  }, [freelancerId]);

  useEffect(() => {
    if (!categoryId) {
      setPrediction(null);
      return;
    }
    setFetchingPrediction(true);
    supabase.functions.invoke('generate-pricing-report', {
      method: 'POST',
      body: {
        category_id: categoryId,
        location: zipCode || '',
        rating: avgRating,
      },
    }).then(({ data }) => {
      if (data?.prediction && data.prediction.suggestedPrice > 0) {
        setPrediction(data.prediction);
      } else {
        setPrediction(null);
      }
    }).catch(() => {
      setPrediction(null);
    }).finally(() => {
      setFetchingPrediction(false);
    });
  }, [categoryId, zipCode, avgRating]);


  const addPricingRow = () =>
    setPricingModels(prev => [...prev, { strategy_type: 'hourly', base_price: 0 }]);

  const removePricingRow = (index: number) =>
    setPricingModels(prev => prev.filter((_, i) => i !== index));

  const updatePricingRow = (index: number, field: keyof PricingModelRow, value: string | number) =>
    setPricingModels(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } as PricingModelRow : row));

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    if (!categoryId) { setError('Please select a category'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
      };
      const activePricing = pricingModels.filter(pm => pm.base_price > 0);
      if (activePricing.length > 0) {
        body.pricing_models = activePricing.map(pm => ({
          strategy_type: pm.strategy_type,
          base_price: Number(pm.base_price),
        }));
      }
      const { error: err } = await supabase.functions.invoke('manage-listing', { body });
      if (err) throw err;
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create listing');
    } finally {
      setLoading(false);
    }
  };

  const hourlyPrice = Number(pricingModels.find(pm => pm.strategy_type === 'hourly')?.base_price ?? 0);

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
        onSubmit={handleCreate}
      >
        <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-1">New Listing</div>
        <h2 className="font-display uppercase text-2xl tracking-tighter mb-6">Create Service</h2>

        <div className="space-y-4">
          <div>
            <label className="font-display uppercase text-[10px] tracking-widest block mb-1">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Logo Design"
              className="w-full border-2 border-black bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:border-vibrant-coral"
            />
          </div>
          <div>
            <label className="font-display uppercase text-[10px] tracking-widest block mb-1">Category *</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full border-2 border-black bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:border-vibrant-coral"
            >
              <option value="">Select a category...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-display uppercase text-[10px] tracking-widest block mb-1">Description *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what you offer..."
              className="w-full border-2 border-black bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:border-vibrant-coral resize-none"
            />
            {checkingCategorization && (
              <div className="mt-2 font-mono text-[9px] uppercase opacity-40 animate-pulse text-black">
                🔍 AI validating category match...
              </div>
            )}
            {categorization && (
              <div className={cn(
                "mt-2 p-3 border-2 border-black shadow-brutal-sm text-[10px] font-mono uppercase font-bold",
                categorization.match ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#fef7e0] text-[#b06000]"
              )}>
                {categorization.match ? (
                  <span>✓ Category Verified ({(categorization.confidence * 100).toFixed(0)}% semantic match)</span>
                ) : (
                  <span>⚠️ Category Mismatch Warning ({(categorization.confidence * 100).toFixed(0)}% match — may trigger spam moderation)</span>
                )}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-display uppercase text-[10px] tracking-widest">Pricing Options</label>
              <button
                type="button"
                onClick={addPricingRow}
                className="font-mono text-[10px] uppercase text-vibrant-coral hover:underline"
              >
                + Add option
              </button>
            </div>
            <div className="space-y-2">
              {pricingModels.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={row.strategy_type}
                    onChange={e => updatePricingRow(i, 'strategy_type', e.target.value)}
                    className="flex-1 border-2 border-black bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-vibrant-coral"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="fixed">Fixed</option>
                    <option value="project">Project</option>
                  </select>
                  <div className="flex items-center border-2 border-black bg-white">
                    <span className="px-2 font-mono text-sm opacity-50">$</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={row.base_price || ''}
                      onChange={e => updatePricingRow(i, 'base_price', e.target.value)}
                      className="w-20 py-2 pr-3 font-mono text-sm focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePricingRow(i)}
                    disabled={pricingModels.length === 1}
                    className="text-rosy-copper/60 hover:text-rosy-copper disabled:opacity-20 transition-colors font-mono text-lg leading-none"
                    title="Remove pricing option"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {prediction && (
              <div className="mt-4 p-4 border-2 border-black bg-white shadow-brutal-sm text-xs font-mono">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-[9px] uppercase tracking-wider text-vibrant-coral">AI Rate Advisor</span>
                  <span className={cn(
                    "px-2 py-0.5 border border-black font-bold uppercase text-[8px]",
                    hourlyPrice === 0 && "bg-bone text-black",
                    hourlyPrice > 0 && hourlyPrice < prediction.minPrice && "bg-vibrant-coral text-white",
                    hourlyPrice >= prediction.minPrice && hourlyPrice <= prediction.maxPrice && "bg-shadow-grey text-white",
                    hourlyPrice > prediction.maxPrice && "bg-[#FFF0ed] text-vibrant-coral border-vibrant-coral"
                  )}>
                    {hourlyPrice === 0 ? "Set hourly rate" :
                     hourlyPrice < prediction.minPrice ? "Value Rate" :
                     hourlyPrice > prediction.maxPrice ? "Premium Rate" :
                     "Optimized Rate"}
                  </span>
                </div>
                <p className="leading-relaxed opacity-80">
                  Based on your rating of <span className="font-bold text-shadow-grey">{avgRating} stars</span> and location, our AI recommends an hourly rate between <span className="font-bold">${prediction.minPrice}</span> and <span className="font-bold">${prediction.maxPrice}/hr</span> (Suggested: <span className="font-bold">${prediction.suggestedPrice}/hr</span>).
                </p>
                {hourlyPrice > 0 && (
                  <p className="mt-2 font-bold text-[10px] uppercase text-vibrant-coral">
                    {hourlyPrice < prediction.minPrice ? "⚡ Pricing below recommended rate — great value for clients!" :
                     hourlyPrice > prediction.maxPrice ? "⚠️ Premium pricing above recommended AI rate." :
                     "✓ Rate is optimized and falls within the AI recommended range!"}
                  </p>
                )}
              </div>
            )}
            {fetchingPrediction && (
              <div className="mt-2 font-mono text-[9px] uppercase opacity-40 animate-pulse">
                Fetching AI market recommendation...
              </div>
            )}
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
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
};


// ── Edit Listing Modal ────────────────────────────────────────
type PricingModelRow = { strategy_type: 'fixed' | 'hourly' | 'project'; base_price: number };

const EditListingModal = ({
  listing,
  initialPricingModels,
  onSaved,
  onClose,
  freelancerId,
}: {
  listing: ServiceListing;
  initialPricingModels: PricingModelRow[];
  onSaved: () => void;
  onClose: () => void;
  freelancerId: string;
}) => {
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [categoryId, setCategoryId] = useState(listing.categoryId);
  const [pricingModels, setPricingModels] = useState<PricingModelRow[]>(
    initialPricingModels.length > 0
      ? initialPricingModels.map(pm => ({ strategy_type: pm.strategy_type, base_price: pm.base_price }))
      : [{ strategy_type: 'hourly', base_price: 0 }]
  );
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [zipCode, setZipCode] = useState('');
  const [avgRating, setAvgRating] = useState(4.5);
  const [prediction, setPrediction] = useState<{ minPrice: number; maxPrice: number; suggestedPrice: number } | null>(null);
  const [fetchingPrediction, setFetchingPrediction] = useState(false);

  const [categorization, setCategorization] = useState<{ match: boolean; confidence: number } | null>(null);
  const [checkingCategorization, setCheckingCategorization] = useState(false);

  useEffect(() => {
    if (!description || !categoryId) {
      setCategorization(null);
      return;
    }

    const categoryName = categories.find(c => c.id === categoryId)?.name || '';
    const categorySlug = categoryName.toLowerCase().trim().replace(/\s+/g, '-');

    setCheckingCategorization(true);

    const timer = setTimeout(async () => {
      try {
        const res = await mlServiceClient.categorizeService({
          description: description,
          claimedCategory: categorySlug,
        });
        if (res) {
          setCategorization(res);
        } else {
          setCategorization(null);
        }
      } catch (err) {
        console.error('Categorization check error:', err);
        setCategorization(null);
      } finally {
        setCheckingCategorization(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [description, categoryId, categories]);

  useEffect(() => {
    supabase.from('categories').select('id, name').order('name').then(({ data }) => {
      if (data) setCategories(data);
    });

    if (freelancerId) {
      supabase.from('users').select('zip_code').eq('id', freelancerId).single().then(({ data }) => {
        if (data?.zip_code) setZipCode(data.zip_code);
      });
      supabase.from('freelancer_rating_aggregates').select('avg_overall').eq('freelancer_id', freelancerId).maybeSingle().then(({ data }) => {
        if (data?.avg_overall) setAvgRating(data.avg_overall);
      });
    }
  }, [freelancerId]);

  useEffect(() => {
    if (!categoryId) {
      setPrediction(null);
      return;
    }
    setFetchingPrediction(true);
    supabase.functions.invoke('generate-pricing-report', {
      method: 'POST',
      body: {
        category_id: categoryId,
        location: zipCode || '',
        rating: avgRating,
      },
    }).then(({ data }) => {
      if (data?.prediction && data.prediction.suggestedPrice > 0) {
        setPrediction(data.prediction);
      } else {
        setPrediction(null);
      }
    }).catch(() => {
      setPrediction(null);
    }).finally(() => {
      setFetchingPrediction(false);
    });
  }, [categoryId, zipCode, avgRating]);


  const addPricingRow = () =>
    setPricingModels(prev => [...prev, { strategy_type: 'hourly', base_price: 0 }]);

  const removePricingRow = (index: number) =>
    setPricingModels(prev => prev.filter((_, i) => i !== index));

  const updatePricingRow = (index: number, field: keyof PricingModelRow, value: string | number) =>
    setPricingModels(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    if (!description.trim()) { setError('Description is required'); return; }
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        id: listing.id,
        title: title.trim(),
        description: description.trim(),
        category_id: categoryId,
        pricing_models: pricingModels.map(pm => ({
          strategy_type: pm.strategy_type,
          base_price: Number(pm.base_price),
        })),
      };
      const { error: err } = await supabase.functions.invoke('manage-listing', { body, method: 'PUT' });
      if (err) throw err;
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save listing');
    } finally {
      setLoading(false);
    }
  };

  const hourlyPrice = Number(pricingModels.find(pm => pm.strategy_type === 'hourly')?.base_price ?? 0);

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
        onSubmit={handleSave}
      >
        <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-1">Edit Listing</div>
        <h2 className="font-display uppercase text-2xl tracking-tighter mb-6">Update Service</h2>

        <div className="space-y-4">
          <div>
            <label className="font-display uppercase text-[10px] tracking-widest block mb-1">Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full border-2 border-black bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:border-vibrant-coral"
            />
          </div>
          <div>
            <label className="font-display uppercase text-[10px] tracking-widest block mb-1">Category</label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              className="w-full border-2 border-black bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:border-vibrant-coral"
            >
              <option value="">Select a category...</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-display uppercase text-[10px] tracking-widest block mb-1">Description *</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full border-2 border-black bg-white px-4 py-3 font-mono text-sm focus:outline-none focus:border-vibrant-coral resize-none"
            />
            {checkingCategorization && (
              <div className="mt-2 font-mono text-[9px] uppercase opacity-40 animate-pulse text-black">
                🔍 AI validating category match...
              </div>
            )}
            {categorization && (
              <div className={cn(
                "mt-2 p-3 border-2 border-black shadow-brutal-sm text-[10px] font-mono uppercase font-bold",
                categorization.match ? "bg-[#e6f4ea] text-[#137333]" : "bg-[#fef7e0] text-[#b06000]"
              )}>
                {categorization.match ? (
                  <span>✓ Category Verified ({(categorization.confidence * 100).toFixed(0)}% semantic match)</span>
                ) : (
                  <span>⚠️ Category Mismatch Warning ({(categorization.confidence * 100).toFixed(0)}% match — may trigger spam moderation)</span>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-display uppercase text-[10px] tracking-widest">Pricing Options</label>
              <button
                type="button"
                onClick={addPricingRow}
                className="font-mono text-[10px] uppercase text-vibrant-coral hover:underline"
              >
                + Add option
              </button>
            </div>
            <div className="space-y-2">
              {pricingModels.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={row.strategy_type}
                    onChange={e => updatePricingRow(i, 'strategy_type', e.target.value)}
                    className="flex-1 border-2 border-black bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-vibrant-coral"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="fixed">Fixed</option>
                    <option value="project">Project</option>
                  </select>
                  <div className="flex items-center border-2 border-black bg-white">
                    <span className="px-2 font-mono text-sm opacity-50">$</span>
                    <input
                      type="number"
                      min="0"
                      value={row.base_price}
                      onChange={e => updatePricingRow(i, 'base_price', e.target.value)}
                      className="w-20 py-2 pr-3 font-mono text-sm focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removePricingRow(i)}
                    disabled={pricingModels.length === 1}
                    className="text-rosy-copper/60 hover:text-rosy-copper disabled:opacity-20 transition-colors font-mono text-lg leading-none"
                    title="Remove pricing option"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {prediction && (
              <div className="mt-4 p-4 border-2 border-black bg-white shadow-brutal-sm text-xs font-mono">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-[9px] uppercase tracking-wider text-vibrant-coral">AI Rate Advisor</span>
                  <span className={cn(
                    "px-2 py-0.5 border border-black font-bold uppercase text-[8px]",
                    hourlyPrice === 0 && "bg-bone text-black",
                    hourlyPrice > 0 && hourlyPrice < prediction.minPrice && "bg-vibrant-coral text-white",
                    hourlyPrice >= prediction.minPrice && hourlyPrice <= prediction.maxPrice && "bg-shadow-grey text-white",
                    hourlyPrice > prediction.maxPrice && "bg-[#FFF0ed] text-vibrant-coral border-vibrant-coral"
                  )}>
                    {hourlyPrice === 0 ? "Set hourly rate" :
                     hourlyPrice < prediction.minPrice ? "Value Rate" :
                     hourlyPrice > prediction.maxPrice ? "Premium Rate" :
                     "Optimized Rate"}
                  </span>
                </div>
                <p className="leading-relaxed opacity-80">
                  Based on your rating of <span className="font-bold text-shadow-grey">{avgRating} stars</span> and location, our AI recommends an hourly rate between <span className="font-bold">${prediction.minPrice}</span> and <span className="font-bold">${prediction.maxPrice}/hr</span> (Suggested: <span className="font-bold">${prediction.suggestedPrice}/hr</span>).
                </p>
                {hourlyPrice > 0 && (
                  <p className="mt-2 font-bold text-[10px] uppercase text-vibrant-coral">
                    {hourlyPrice < prediction.minPrice ? "⚡ Pricing below recommended rate — great value for clients!" :
                     hourlyPrice > prediction.maxPrice ? "⚠️ Premium pricing above recommended AI rate." :
                     "✓ Rate is optimized and falls within the AI recommended range!"}
                  </p>
                )}
              </div>
            )}
            {fetchingPrediction && (
              <div className="mt-2 font-mono text-[9px] uppercase opacity-40 animate-pulse">
                Fetching AI market recommendation...
              </div>
            )}
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
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
};

// ── Main Dashboard ────────────────────────────────────────────
export const FreelancerDashboard = ({ user, onLogout, onSwitchToClient, onViewTransactions }: FreelancerDashboardProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'offers' ? 'offers' : 'listings';

  const [listings, setListings] = useState<ServiceListing[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState<number | string>("—");
  const [showNewListing, setShowNewListing] = useState(false);
  const [activeTab, setActiveTab] = useState<'listings' | 'offers'>(initialTab);
  const [listingToDelete, setListingToDelete] = useState<ServiceListing | null>(null);
  const [listingToEdit, setListingToEdit] = useState<ServiceListing | null>(null);
  const [pricingModelsMap, setPricingModelsMap] = useState<Record<string, PricingModelRow[]>>({});
  const [deleting, setDeleting] = useState(false);

  const [activeReport, setActiveReport] = useState<any | null>(null);
  const [selectedListingForReport, setSelectedListingForReport] = useState<any | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const navigate = useNavigate();
  const freelancerId = user.id ?? '';

  const handleOpenReport = async (listing: ServiceListing) => {
    setLoadingReport(true);
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('zip_code, service_area')
        .eq('id', freelancerId)
        .maybeSingle();

      const userLocation = userData?.service_area || userData?.zip_code || '';

      const { data: ratingData } = await supabase
        .from('freelancer_rating_aggregates')
        .select('avg_overall, review_count')
        .eq('freelancer_id', freelancerId)
        .maybeSingle();

      const rating = ratingData?.avg_overall ?? 4.5;
      const reviewsCount = ratingData?.review_count ?? 0;

      const { data: categoryData } = await supabase
        .from('categories')
        .select('name, slug')
        .eq('id', listing.categoryId)
        .maybeSingle();

      const categoryName = categoryData?.name || '';
      const categorySlug = categoryData?.slug || '';

      // Normalize & map category to mockData keys
      let mappedCategory = 'design';
      if (categorySlug.includes('dev') || categorySlug.includes('code') || categorySlug.includes('software')) {
        mappedCategory = 'development';
      } else if (categorySlug.includes('writ') || categorySlug.includes('edit')) {
        mappedCategory = 'writing';
      }

      const { data: reportData, error } = await supabase.functions.invoke('generate-pricing-report', {
        method: 'POST',
        body: {
          category_id: listing.categoryId,
          location: userLocation,
          rating: rating,
        },
      });

      if (error) throw error;

      if (reportData && !reportData.error) {
        const getListingPrice = (l: ServiceListing) => {
          try {
            return l.getPrice();
          } catch {
            const models = pricingModelsMap[l.id];
            return models?.[0]?.base_price ?? 0;
          }
        };

        const price = getListingPrice(listing);

        const mockReport = getPricingReport({
          id: listing.id,
          name: user.name || 'You',
          price: price,
          category: mappedCategory,
          role: categoryName || 'Freelancer',
        } as any);

        // Process scatter data exactly as in FreelancerProfile
        const scatterBase = (reportData.scatterData?.length > 0 ? reportData.scatterData : mockReport.scatterData)
          .map((p: any) => p.name === user.name || p.name === listing.title ? { ...p, isCurrent: true, price: price } : p);

        const hasCurrentFreelancer = scatterBase.some((p: any) => p.isCurrent);
        if (!hasCurrentFreelancer) {
          scatterBase.push({
            name: user.name || 'You',
            price: price,
            rating: rating,
            reviews: reviewsCount,
            isCurrent: true,
          });
        }

        // Recalculate percentile exactly like FreelancerProfile
        const allPrices = scatterBase.map((p: any) => p.price).sort((a: number, b: number) => a - b);
        const below = allPrices.filter((p: number) => p < price).length;
        const percentile = allPrices.length > 0 ? Math.round((below / allPrices.length) * 100) : mockReport.percentile;

        const fullReport = {
          ...mockReport,
          category: categoryName || listing.title,
          marketAvg: reportData.marketAvg ?? mockReport.marketAvg,
          marketMedian: reportData.marketMedian ?? mockReport.marketMedian,
          marketMin: reportData.marketMin ?? mockReport.marketMin,
          marketMax: reportData.marketMax ?? mockReport.marketMax,
          sampleSize: reportData.transactionCount ?? mockReport.sampleSize,
          priceDistribution: reportData.priceDistribution?.length > 0 ? reportData.priceDistribution : mockReport.priceDistribution,
          scatterData: scatterBase,
          percentile,
          prediction: reportData.prediction ?? mockReport.prediction,
        };

        setSelectedListingForReport({
          id: listing.id,
          name: user.name || 'You',
          freelancerName: user.name,
          role: categoryName || 'Freelancer',
          category: mappedCategory,
          price: price,
          rating: rating,
          reviews: reviewsCount,
          location: userLocation || 'Remote',
        });
        setActiveReport(fullReport);
      } else {
        alert('Not enough transactions or pricing data available in this category yet to generate a market report.');
      }
    } catch (err) {
      console.error('Error loading pricing report in dashboard:', err);
      alert('Could not retrieve competitor pricing data.');
    } finally {
      setLoadingReport(false);
    }
  };

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'offers' || tab === 'listings') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleViewListing = (l: ServiceListing) => navigate(`/freelancer/${l.id}?preview=true`);

  const fetchData = async () => {
    if (!freelancerId) return;
    setLoading(true);
    try {
      const [{ data: listingRows }, { data: offerRows }, { count }] = await Promise.all([
        supabase
          .from('listings')
          .select('*, pricing_models(*)')
          .eq('freelancer_id', freelancerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('offers')
          .select('*, customer:users!offers_customer_id_fkey(full_name)')
          .eq('freelancer_id', freelancerId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('freelancer_id', freelancerId)
          .not('completed_at', 'is', null),
      ]);

      const rawMap: Record<string, PricingModelRow[]> = {};
      (listingRows ?? []).forEach(r => {
        rawMap[r.id] = (r.pricing_models ?? []).map((pm: any) => ({
          strategy_type: pm.strategy_type,
          base_price: pm.base_price,
        }));
      });
      setPricingModelsMap(rawMap);
      setListings((listingRows ?? []).map(r =>
        ServiceListing.fromRow(r, r.pricing_models?.[0] ?? null)
      ));
      setOffers((offerRows ?? []).map(r => Offer.fromRow(r)));
      if (count !== null) setCompletedCount(count);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (!freelancerId) return;

    const channel = supabase
      .channel(`offers-${freelancerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'offers',
          filter: `freelancer_id=eq.${freelancerId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOffer = Offer.fromRow(payload.new);
            if (newOffer.status === 'pending') {
              // Fetch the customer's full_name to display it
              supabase
                .from('users')
                .select('full_name')
                .eq('id', newOffer.customerId)
                .single()
                .then(({ data }) => {
                  if (data?.full_name) {
                    newOffer.customerName = data.full_name;
                  }
                  setOffers((prev) => [newOffer, ...prev]);
                });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedOffer = Offer.fromRow(payload.new);
            setOffers((prev) => {
              const exists = prev.find((o) => o.id === updatedOffer.id);
              if (exists) {
                updatedOffer.customerName = exists.customerName;
              }
              if (updatedOffer.status === 'pending') {
                if (exists) {
                  return prev.map((o) => (o.id === updatedOffer.id ? updatedOffer : o));
                } else {
                  // If we didn't have it in state before, fetch its customerName
                  supabase
                    .from('users')
                    .select('full_name')
                    .eq('id', updatedOffer.customerId)
                    .single()
                    .then(({ data }) => {
                      if (data?.full_name) {
                        updatedOffer.customerName = data.full_name;
                      }
                      setOffers((current) => current.map((o) => o.id === updatedOffer.id ? updatedOffer : o));
                    });
                  return [updatedOffer, ...prev];
                }
              } else {
                return prev.filter((o) => o.id !== updatedOffer.id);
              }
            });
          } else if (payload.eventType === 'DELETE') {
            setOffers((prev) => prev.filter((o) => o.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [freelancerId]);

  const handleDeleteConfirm = async () => {
    if (!listingToDelete) return;
    setDeleting(true);
    try {
      await listingToDelete.deleteListing();
      setListings(prev => prev.filter(l => l.id !== listingToDelete.id));
      setListingToDelete(null);
    } catch (e) { console.error(e); } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async (listing: ServiceListing) => {
    await listing.updateListing({ isActive: !listing.isActive });
    setListings(prev => prev.map(l => l.id === listing.id ? Object.assign(Object.create(Object.getPrototypeOf(l)), l) : l));
  };

  const handleAccept = async (offer: Offer) => {
    try {
      await offer.accept();
      setOffers(prev => prev.filter(o => o.id !== offer.id));
    } catch (e) { console.error(e); }
  };

  const handleReject = async (offer: Offer) => {
    try {
      await offer.reject();
      setOffers(prev => prev.filter(o => o.id !== offer.id));
    } catch (e) { console.error(e); }
  };

  const handleCounter = async (offer: Offer, newAmount: number) => {
    try {
      await offer.counter(newAmount);
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const activeListings  = listings.filter(l => l.isActive).length;
  const pendingOffers   = offers.length;

  return (
    <main className="flex-1 bg-bone">
      {/* Header */}
      <div className="border-b-4 border-black bg-shadow-grey text-white px-8 py-10">
        <div className="max-w-5xl mx-auto flex items-end justify-between gap-6 flex-wrap">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-2">Freelancer Dashboard</div>
            <h1 className="font-display uppercase text-4xl md:text-5xl tracking-tighter">
              Welcome back, {user.name.split(' ')[0]}
            </h1>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <button
              onClick={onViewTransactions}
              className="px-5 py-2 bg-white text-black border-2 border-transparent font-display uppercase text-sm shadow-brutal-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
            >
              Transactions
            </button>
            <button
              onClick={onSwitchToClient}
              className="px-5 py-2 border-2 border-white/30 font-display uppercase text-sm hover:bg-white/10 transition-colors"
            >
              Switch to Client
            </button>
            <button
              onClick={onLogout}
              className="px-5 py-2 border-2 border-white/30 font-display uppercase text-sm hover:bg-white/10 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-10 space-y-10">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Briefcase}    label="Total Listings"  value={listings.length} />
          <StatCard icon={ToggleRight}  label="Active"          value={activeListings} accent />
          <StatCard icon={Clock}        label="Pending Offers"  value={pendingOffers} />
          <StatCard icon={TrendingUp}   label="Completed"       value={completedCount} />
        </div>

        {/* Tab switcher */}
        <div className="flex gap-0 border-4 border-black w-fit">
          {(['listings', 'offers'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSearchParams(prev => {
                  const next = new URLSearchParams(prev);
                  next.set('tab', tab);
                  return next;
                });
              }}
              className={cn(
                'px-6 py-2 font-display uppercase text-sm tracking-tight transition-colors',
                activeTab === tab
                  ? 'bg-shadow-grey text-white'
                  : 'bg-white hover:bg-black/5'
              )}
            >
              {tab === 'listings' ? `Listings (${listings.length})` : `Offers (${pendingOffers})`}
            </button>
          ))}
        </div>

        {/* Listings tab */}
        {activeTab === 'listings' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">Your Services</div>
              <button
                onClick={() => setShowNewListing(true)}
                className="flex items-center gap-2 px-4 py-2 bg-vibrant-coral text-white border-2 border-black font-display uppercase text-sm shadow-brutal-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                <Plus size={14} /> New Listing
              </button>
            </div>

            {loading ? (
              <div className="font-mono text-sm uppercase opacity-40 animate-pulse">Loading...</div>
            ) : listings.length === 0 ? (
              <div className="border-4 border-dashed border-black/20 p-10 text-center">
                <div className="font-display uppercase text-xl opacity-30 mb-2">No listings yet</div>
                <button onClick={() => setShowNewListing(true)} className="font-mono text-xs uppercase opacity-50 hover:opacity-100 underline">
                  Create your first listing
                </button>
              </div>
            ) : (
              <motion.div layout className="grid gap-4 md:grid-cols-2">
                {listings.map(listing => (
                  <ListingCard key={listing.id} listing={listing} onToggle={handleToggle} onView={handleViewListing} onEdit={item => setListingToEdit(item)} onDelete={item => setListingToDelete(item)} onOpenReport={handleOpenReport} />
                ))}
              </motion.div>
            )}
          </section>
        )}

        {/* Offers tab */}
        {activeTab === 'offers' && (
          <section className="space-y-4">
            <div className="font-mono text-[10px] uppercase tracking-widest opacity-60">Pending Offers</div>

            {loading ? (
              <div className="font-mono text-sm uppercase opacity-40 animate-pulse">Loading...</div>
            ) : offers.length === 0 ? (
              <div className="border-4 border-dashed border-black/20 p-10 text-center">
                <div className="font-display uppercase text-xl opacity-30">No pending offers</div>
              </div>
            ) : (
              <motion.div layout className="space-y-4">
                {offers.map(o => (
                  <OfferCard
                    key={o.id}
                    offer={o}
                    userRole="freelancer"
                    onAccept={handleAccept}
                    onReject={handleReject}
                    onCounter={handleCounter}
                  />
                ))}
              </motion.div>
            )}
          </section>
        )}
      </div>

      {/* New Listing Modal */}
      <AnimatePresence>
        {showNewListing && (
          <NewListingModal
            freelancerId={freelancerId}
            onCreated={fetchData}
            onClose={() => setShowNewListing(false)}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {listingToDelete && (
          <ConfirmDeleteModal
            title="Delete Listing"
            message={`Are you sure you want to delete "${listingToDelete.title}"? This cannot be undone.`}
            onConfirm={handleDeleteConfirm}
            onCancel={() => setListingToDelete(null)}
            loading={deleting}
          />
        )}
      </AnimatePresence>

      {/* Edit Listing Modal */}
      <AnimatePresence>
        {listingToEdit && (
          <EditListingModal
            listing={listingToEdit}
            initialPricingModels={pricingModelsMap[listingToEdit.id] ?? []}
            onSaved={fetchData}
            onClose={() => setListingToEdit(null)}
            freelancerId={freelancerId}
          />
        )}
      </AnimatePresence>

      {/* Competitor Price Analytics Report */}
      {activeReport && selectedListingForReport && (
        <PricingReportModal
          report={activeReport}
          listing={selectedListingForReport}
          onClose={() => {
            setActiveReport(null);
            setSelectedListingForReport(null);
          }}
        />
      )}

      {/* Loading Analytics Spinner Overlay */}
      {loadingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border-4 border-black p-8 shadow-brutal text-center max-w-sm">
            <div className="w-12 h-12 border-4 border-black border-t-vibrant-coral rounded-full animate-spin mx-auto mb-4" />
            <div className="font-display uppercase text-lg">Fetching Market Report</div>
            <div className="font-mono text-[10px] uppercase opacity-60 mt-1">Analyzing competitor rates and scatter plots...</div>
          </div>
        </div>
      )}
    </main>
  );
};
