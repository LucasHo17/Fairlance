import React, { useState, useEffect } from 'react';
import { CustomerUser } from '../models/users/UserSubclasses';
import { getPricingReport } from '../data/mockData';
import { X, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabaseClient';

interface OfferModalProps {
  listing: any;
  user: any; // Ideally CustomerUser, but type checks will be fine
  onClose: () => void;
}

export function OfferModal({ listing, user, onClose }: OfferModalProps) {
  const [amount, setAmount] = useState<string>('');
  const [scope, setScope] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [zipCode, setZipCode] = useState('');
  const [avgRating, setAvgRating] = useState(4.5);
  const [categoryId, setCategoryId] = useState('');
  const [prediction, setPrediction] = useState<{ minPrice: number; maxPrice: number; suggestedPrice: number } | null>(null);
  const [fetchingPrediction, setFetchingPrediction] = useState(false);

  useEffect(() => {
    if (!listing?.id) return;

    const fetchDetails = async () => {
      try {
        const { data: item, error } = await supabase.functions.invoke(`get-listings?id=${encodeURIComponent(listing.id.toString())}`, {
          method: 'GET',
        });
        if (error || !item) return;

        if (item.category_id) setCategoryId(item.category_id);
        const fId = item.freelancer_id;
        const location = item.users?.service_area || item.users?.zip_code || '';
        if (location) setZipCode(location);

        if (fId) {
          const { data: ratingData } = await supabase
            .from('freelancer_rating_aggregates')
            .select('avg_overall')
            .eq('freelancer_id', fId)
            .maybeSingle();

          if (ratingData?.avg_overall) {
            setAvgRating(ratingData.avg_overall);
          }
        }
      } catch (err) {
        console.error('Error fetching listing details in OfferModal:', err);
      }
    };

    fetchDetails();
  }, [listing?.id]);

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
    }).catch((err) => {
      console.error('Error fetching prediction:', err);
      setPrediction(null);
    }).finally(() => {
      setFetchingPrediction(false);
    });
  }, [categoryId, zipCode, avgRating]);

  // Market comparator data
  const report = getPricingReport(listing);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;

    if (user && user instanceof CustomerUser) {
      try {
        setLoading(true);
        await user.placeOffer({
          listingId: listing.id.toString(), // The mock is returning number for listing.id, but placeOffer takes string. Wait, we should use listing.id.toString() or stringify. Let's see later.
          amount: parseFloat(amount),
          scope: scope,
        });
        setSuccess(true);
      } catch (err) {
        console.error(err);
        alert('Failed to place offer');
      } finally {
        setLoading(false);
      }
    } else {
      alert('You must be logged in as a customer to place an offer.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white border-4 border-black shadow-brutal w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b-4 border-black bg-vibrant-coral">
          <h2 className="text-2xl font-display text-white uppercase tracking-tighter">Make an Offer</h2>
          <button onClick={onClose} className="p-2 hover:bg-black/10 text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-8">
          {success ? (
            <div className="text-center py-12 space-y-6">
              <div className="w-20 h-20 bg-vibrant-coral text-white border-4 border-black shadow-brutal mx-auto flex items-center justify-center">
                <Check size={40} />
              </div>
              <div>
                <h3 className="text-3xl font-display uppercase tracking-tighter mb-2">Offer Sent!</h3>
                <p className="font-mono text-sm opacity-60">
                  Your offer has been sent to {listing.name}. They will review it shortly.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-8 py-3 bg-white border-2 border-black font-display uppercase text-sm shadow-brutal-sm hover:translate-y-0.5 hover:shadow-none transition-all"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block font-mono text-xs uppercase mb-2">Offer Amount ($/hr or flat)</label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full p-3 border-2 border-black font-mono text-lg focus:outline-none focus:ring-2 focus:ring-vibrant-coral/20"
                    placeholder="e.g. 150"
                  />
                  {(() => {
                    const offerPrice = parseFloat(amount) || 0;
                    return (
                      <>
                        {prediction && (
                          <div className="mt-4 p-4 border-2 border-black bg-white shadow-brutal-sm text-xs font-mono">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-[9px] uppercase tracking-wider text-vibrant-coral">AI Offer Validator</span>
                              <span className={cn(
                                "px-2 py-0.5 border border-black font-bold uppercase text-[8px]",
                                offerPrice === 0 && "bg-bone text-black",
                                offerPrice > 0 && offerPrice < prediction.minPrice && "bg-vibrant-coral text-white",
                                offerPrice >= prediction.minPrice && offerPrice <= prediction.maxPrice && "bg-shadow-grey text-white",
                                offerPrice > prediction.maxPrice && "bg-[#FFF0ed] text-vibrant-coral border-vibrant-coral"
                              )}>
                                {offerPrice === 0 ? "Set offer rate" :
                                 offerPrice < prediction.minPrice ? "Competitive Value" :
                                 offerPrice > prediction.maxPrice ? "Premium Offer" :
                                 "Fair Market Rate"}
                              </span>
                            </div>
                            <p className="leading-relaxed opacity-80 text-black">
                              Based on rating of <span className="font-bold text-shadow-grey">{avgRating} stars</span> and location, our AI recommends a rate between <span className="font-bold">${prediction.minPrice}</span> and <span className="font-bold">${prediction.maxPrice}/hr</span> (Suggested: <span className="font-bold">${prediction.suggestedPrice}/hr</span>).
                            </p>
                            {offerPrice > 0 && (
                              <p className="mt-2 font-bold text-[10px] uppercase text-vibrant-coral">
                                {offerPrice < prediction.minPrice ? "⚡ Your offer is below the recommended range. This is an excellent value for you, but might require negotiation!" :
                                 offerPrice > prediction.maxPrice ? "💎 Your offer is premium. Highly attractive to the freelancer!" :
                                 "✓ Your offer is in the optimal range. High likelihood of acceptance!"}
                              </p>
                            )}
                          </div>
                        )}
                        {fetchingPrediction && (
                          <div className="mt-2 font-mono text-[9px] uppercase opacity-40 animate-pulse text-black">
                            Fetching AI market recommendation...
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div>
                  <label className="block font-mono text-xs uppercase mb-2">Scope of Work (Optional)</label>
                  <textarea
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    rows={4}
                    className="w-full p-3 border-2 border-black font-mono text-sm focus:outline-none focus:ring-2 focus:ring-vibrant-coral/20 resize-none"
                    placeholder="Describe the project scope..."
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-vibrant-coral text-white font-display uppercase text-lg border-4 border-black shadow-brutal hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-brutal"
                >
                  {loading ? 'Sending...' : 'Submit Offer'}
                </button>
              </form>

              <div className="bg-shadow-grey text-white border-4 border-black p-6 flex flex-col justify-center">
                <div className="font-mono text-[10px] uppercase opacity-60 mb-2">Market Comparator</div>
                <div className="font-display text-xl uppercase tracking-tighter mb-4">
                  Market Context
                </div>
                <div className="space-y-4 text-sm font-mono uppercase">
                  <div className="flex justify-between items-center border-b border-white/20 pb-2">
                    <span className="opacity-70">Market Avg</span>
                    <span className="font-bold text-vibrant-coral">${report.marketAvg}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/20 pb-2">
                    <span className="opacity-70">Market Median</span>
                    <span className="font-bold">${report.marketMedian}</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-white/20 pb-2">
                    <span className="opacity-70">This Freelancer</span>
                    <span className="font-bold">${listing.price}</span>
                  </div>
                </div>
                <p className="font-mono text-[10px] opacity-60 mt-6 leading-relaxed">
                  Based on {report.sampleSize} recent transactions in the {listing.role} category.
                </p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
