'use client';
import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, XCircle, RotateCcw, Loader2, Brain } from 'lucide-react';
import { t as tr, type SupportedLang } from '@/src/lib/ui-i18n';

interface VocabItem {
  token: string;
  meaning: string;
  targetLang: string;
  mastery: number;
}

interface Props {
  targetLang: string;
  uiLang: SupportedLang;
  onClose: () => void;
}

export function VocabReview({ targetLang, uiLang, onClose }: Props) {
  const [items, setItems] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState<{ knew: boolean }[]>([]);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/vocabulary/due?lang=${encodeURIComponent(targetLang)}`)
      .then(r => r.json())
      .then(({ items: fetched }: { items: VocabItem[] }) => {
        // Shuffle so review order isn't predictable
        const shuffled = [...fetched].sort(() => Math.random() - 0.5);
        setItems(shuffled);
      })
      .catch(err => console.error('[VocabReview] Failed to load due vocabulary:', err))
      .finally(() => setLoading(false));
  }, [targetLang]);

  const current = items[index];

  const handleAnswer = useCallback(async (knew: boolean) => {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/vocabulary/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: current.token, targetLang: current.targetLang, knew }),
      });
    } catch {}
    setResults(prev => [...prev, { knew }]);
    setSubmitting(false);
    if (index + 1 >= items.length) {
      setDone(true);
    } else {
      setIndex(i => i + 1);
      setFlipped(false);
    }
  }, [current, index, items.length, submitting]);

  const knewCount = results.filter(r => r.knew).length;
  const didntCount = results.filter(r => !r.knew).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vocab-review-title"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-violet-500" />
            <h2 id="vocab-review-title" className="font-semibold text-gray-900">Vocabulary Review</h2>
            {!loading && !done && (
              <span className="text-xs text-gray-400 font-medium">{index + 1} / {items.length}</span>
            )}
          </div>
          <button onClick={onClose} aria-label="Close vocabulary review" className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 size={28} className="animate-spin text-violet-400" />
              <p className="text-sm text-gray-400">Loading due vocabulary…</p>
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <CheckCircle size={40} className="text-emerald-400" />
              <div>
                <p className="font-semibold text-gray-800">All caught up!</p>
                <p className="text-sm text-gray-500 mt-1">No vocabulary due for review right now.</p>
              </div>
              <button onClick={onClose} className="px-5 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
                Close
              </button>
            </div>
          )}

          {!loading && !done && current && (
            <div className="space-y-5">
              {/* Progress bar */}
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-violet-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${(index / items.length) * 100}%` }}
                />
              </div>

              {/* Card */}
              <div
                className="min-h-[180px] bg-gradient-to-br from-violet-50 to-blue-50 border border-violet-100 rounded-2xl flex flex-col items-center justify-center gap-3 p-6 cursor-pointer select-none"
                onClick={() => !flipped && setFlipped(true)}
              >
                {!flipped ? (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">Meaning</p>
                    <p className="text-2xl font-black text-gray-900 text-center">{current.meaning}</p>
                    <p className="text-xs text-violet-400 mt-2">Tap to reveal the {current.targetLang} word</p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                      {current.targetLang} word
                    </p>
                    <p className="text-3xl font-black text-gray-900 text-center">{current.token}</p>
                    <p className="text-sm text-gray-500 mt-1 text-center">Did you know it?</p>
                  </>
                )}
              </div>

              {/* Answer buttons — only shown after flip */}
              {flipped ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleAnswer(false)}
                    disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-bold hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    <XCircle size={18} /> Didn't know
                  </button>
                  <button
                    onClick={() => handleAnswer(true)}
                    disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-emerald-200 text-emerald-700 font-bold hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle size={18} /> Knew it!
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setFlipped(true)}
                  className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors"
                >
                  Flip to reveal
                </button>
              )}
            </div>
          )}

          {!loading && done && (
            <div className="space-y-5 py-4 text-center">
              <div className="flex items-center justify-center gap-3">
                <div className="text-center">
                  <p className="text-4xl font-black text-emerald-600">{knewCount}</p>
                  <p className="text-xs text-gray-400 font-medium mt-1">Knew</p>
                </div>
                <div className="text-2xl text-gray-200 font-light">/</div>
                <div className="text-center">
                  <p className="text-4xl font-black text-red-400">{didntCount}</p>
                  <p className="text-xs text-gray-400 font-medium mt-1">Missed</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                {knewCount === items.length ? 'Perfect session! 🎉' : 'SRS updated — missed words scheduled for sooner review.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => { setIndex(0); setFlipped(false); setResults([]); setDone(false); setItems(prev => [...prev].sort(() => Math.random() - 0.5)); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw size={14} /> Review again
                </button>
                <button onClick={onClose} className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
