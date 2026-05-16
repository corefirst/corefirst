"use client";

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Sparkles, ChevronDown, ChevronRight, Clock, PlayCircle, Trash2 } from 'lucide-react';
import { CFLTBlock, type CFLTBlockType } from './CFLTBlock';
import { t as tr, type SupportedLang, localizeLang } from '../src/lib/ui-i18n';
import { useSettings } from '../hooks/useSettings';
import { HISTORY_PAGE_SIZE } from '../src/lib/constants';

interface TransformItem {
  eventId: string;
  inputText: string;
  sourceLang: string;
  targetLang: string;
  cfltL1: string;
  cfltL2: string;
  standardL2: string;
  createdAt: string;
  packageSlug: string;
}

interface HistoryPayload {
  transforms: TransformItem[];
}

const SLOT_TYPES: CFLTBlockType[] = ['core', 'reason', 'space', 'time'];
const SLOT_LABEL_KEYS = ['slotCore', 'slotReason', 'slotSpace', 'slotTime'] as const;

const formatTimestamp = (iso: string, lang: SupportedLang) => {
  const locale = (
    { English: 'en', Chinese: 'zh-CN', Japanese: 'ja', Korean: 'ko', Vietnamese: 'vi', Spanish: 'es', French: 'fr', German: 'de' } as const
  )[lang] ?? 'en';
  try {
    return new Date(iso).toLocaleString(locale, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

// Stored CFLT strings are comma-joined; split back into 4 typed blocks for
// visual fidelity with the live transform result. We don't store per-slot
// metadata (is_inferred / suggestions / fills), so history display is
// purely visual — no inferred-drop or pick-your-own affordance.
function splitToBlocks(cflt: string): { type: CFLTBlockType; text: string }[] {
  const parts = cflt.split(/[，,]/).map((p) => p.trim()).filter(Boolean);
  return parts.map((text, i) => ({
    type: SLOT_TYPES[i] ?? 'space',
    text,
  }));
}

interface Props {
  uiLang: SupportedLang;
  /** Bump to force a re-fetch (e.g., after a new transform is submitted). */
  refreshKey?: number;
}

export const TransformHistory = ({ uiLang, refreshKey = 0 }: Props) => {
  const { getHeaders } = useSettings();
  const [items, setItems] = useState<TransformItem[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (eventId: string) => {
    if (!window.confirm(tr(uiLang, 'confirmDeleteTransform'))) return;
    setDeleting(eventId);
    try {
      const res = await fetch(`/api/history/transforms/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete failed');
      setItems((prev) => (prev ?? []).filter((t) => t.eventId !== eventId));
    } catch (err) {
      console.error('[TransformHistory] delete error:', err);
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHasError(false);
    (async () => {
      try {
        const res = await fetch('/api/history/transforms', {
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error('Failed to load history');
        const payload: HistoryPayload = await res.json();
        if (!cancelled) {
          setItems(payload.transforms);
          setVisibleCount(HISTORY_PAGE_SIZE);
        }
      } catch (err) {
        console.error('[TransformHistory] Error:', err);
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const playAudio = async (text: string, id: string) => {
    setAudioLoading(id);
    let url: string | null = null;
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error('TTS failed');
      const blob = await response.blob();
      url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
      audio.onerror = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
      await audio.play();
    } catch (err) {
      console.error('[TransformHistory] playAudio error:', err);
      if (url) URL.revokeObjectURL(url);
    } finally {
      setAudioLoading(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  );

  if (hasError) return (
    <div className="bg-white p-8 rounded-3xl shadow-sm text-center space-y-3">
      <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
      <p className="text-slate-500 text-sm">{tr(uiLang, 'historyError')}</p>
    </div>
  );

  const list = items ?? [];
  if (list.length === 0) return (
    <div className="bg-white p-8 rounded-3xl shadow-sm text-center space-y-3">
      <Clock className="w-8 h-8 text-slate-300 mx-auto" />
      <p className="text-slate-400 text-sm">{tr(uiLang, 'historyEmpty')}</p>
    </div>
  );

  const visibleItems = list.slice(0, visibleCount);
  const hasMore = list.length > visibleCount;

  return (
    <section className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-white space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
          <Sparkles className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-black text-slate-800">{tr(uiLang, 'historyTransformsHeader')}</h2>
        <span className="text-xs font-bold text-slate-400">({list.length})</span>
      </div>

      <ul className="space-y-3">
        {visibleItems.map((item, i) => {
          const id = item.eventId || `${item.createdAt}-${i}`;
          const isOpen = expanded.has(id);
          const isDeleting = deleting === item.eventId;
          const l1Blocks = splitToBlocks(item.cfltL1);
          const l2Blocks = splitToBlocks(item.cfltL2);

          return (
            <li
              key={id}
              className="border border-slate-100 rounded-2xl overflow-hidden hover:border-blue-200 hover:shadow-md hover:shadow-blue-50 transition-all"
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="w-full p-5 text-left hover:bg-slate-50 transition-colors"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center justify-between mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400 pr-14">
                    <span>{localizeLang(item.sourceLang, uiLang)} → {localizeLang(item.targetLang, uiLang)}</span>
                    <span>{formatTimestamp(item.createdAt, uiLang)}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                        {tr(uiLang, 'historyInputLabel')}
                      </p>
                      <p className="text-slate-700 font-medium truncate">{item.inputText}</p>
                      <p className="text-slate-900 font-black italic mt-2 truncate">"{item.standardL2}"</p>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 mt-1 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 mt-1 shrink-0" />}
                  </div>
                </button>
                {item.eventId && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDelete(item.eventId); }}
                    disabled={isDeleting}
                    aria-label={tr(uiLang, 'delete')}
                    title={tr(uiLang, 'delete')}
                    className="absolute top-3 right-12 p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                )}
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-slate-100"
                  >
                    <div className="px-5 py-6 space-y-6 text-center">
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{tr(uiLang, 'cfltThinkingHeader')}</h3>
                        <div className="flex flex-wrap items-end justify-center gap-2">
                          {l1Blocks.map((b, k) => (
                            <CFLTBlock
                              key={`l1-${k}`}
                              type={b.type}
                              label={tr(uiLang, SLOT_LABEL_KEYS[k] ?? 'slotCore')}
                              text={b.text}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="h-px bg-slate-100 w-1/2 mx-auto"></div>
                      <div className="space-y-3">
                        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{tr(uiLang, 'targetMappingHeader')}</h3>
                        <div className="flex flex-wrap items-end justify-center gap-2">
                          {l2Blocks.map((b, k) => (
                            <CFLTBlock
                              key={`l2-${k}`}
                              type={b.type}
                              label={tr(uiLang, SLOT_LABEL_KEYS[k] ?? 'slotCore')}
                              text={b.text}
                            />
                          ))}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); playAudio(item.cfltL2, `${id}-cflt`); }}
                          disabled={audioLoading === `${id}-cflt`}
                          aria-label="Play CFLT sentence"
                          className="text-slate-400 hover:text-blue-600 transition-colors disabled:text-slate-200 mx-auto block"
                        >
                          {audioLoading === `${id}-cflt` ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                          ) : (
                            <PlayCircle className="w-6 h-6" />
                          )}
                        </button>
                      </div>
                      <div className="bg-blue-600 p-6 rounded-2xl text-white shadow-lg shadow-blue-200">
                        <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-2">
                          {tr(uiLang, 'standardResultHeader', item.targetLang)}
                        </p>
                        <p className="text-2xl font-black italic">"{item.standardL2}"</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); playAudio(item.standardL2, id); }}
                          disabled={audioLoading === id}
                          aria-label="Play sentence"
                          className="mt-3 text-white/60 hover:text-white transition-colors disabled:text-white/20 mx-auto block"
                        >
                          {audioLoading === id ? (
                            <Loader2 className="w-7 h-7 animate-spin" />
                          ) : (
                            <PlayCircle className="w-7 h-7" />
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((prev) => prev + HISTORY_PAGE_SIZE)}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-100 text-slate-400 text-xs font-black uppercase tracking-widest hover:border-blue-200 hover:text-blue-600 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-2"
        >
          <ChevronDown className="w-4 h-4" />
          {tr(uiLang, 'historyMore')}
        </button>
      )}
    </section>
  );
};
