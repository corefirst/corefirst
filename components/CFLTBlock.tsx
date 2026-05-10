import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, Check, Pencil } from 'lucide-react';
import type { SlotSuggestion } from '@/src/types/cflt';
import { t } from '@/src/lib/ui-i18n';

export type CFLTBlockType = 'core' | 'reason' | 'space' | 'time';

interface CFLTBlockProps {
  type: CFLTBlockType;
  text: string;
  label: string;
  // Optional inferred-slot props. When isInferred=true, the block renders a
  // dashed empty state until the learner picks a suggestion or types their own
  // value. The original LLM-inferred text is intentionally hidden — per CFLT
  // pedagogy the learner needs to engage with the gap, not consume a guess.
  isInferred?: boolean;
  suggestions?: SlotSuggestion[];
  onUserFill?: (value: { l1: string; l2: string; source: 'suggested' | 'typed' }) => void;
  userFill?: { l1: string; l2: string; source: 'suggested' | 'typed' } | null;
  // Source language drives the teaching chrome (hint text, popover labels,
  // YOU-PICKED badge). Defaults to English for legacy callers (course mode).
  sourceLang?: string;
}

const colorMap: Record<CFLTBlockType, string> = {
  core: 'bg-cflt-core',
  reason: 'bg-cflt-reason',
  space: 'bg-cflt-space',
  time: 'bg-cflt-time',
};

const dashedColorMap: Record<CFLTBlockType, string> = {
  core: 'border-cflt-core text-cflt-core',
  reason: 'border-cflt-reason text-cflt-reason',
  space: 'border-cflt-space text-cflt-space',
  time: 'border-cflt-time text-cflt-time',
};

export const CFLTBlock: React.FC<CFLTBlockProps> = ({
  type,
  text,
  label,
  isInferred = false,
  suggestions = [],
  onUserFill,
  userFill,
  sourceLang = 'English',
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftL1, setDraftL1] = useState('');

  // ── Filled-in state (learner picked / typed) ──
  if (isInferred && userFill) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`p-4 rounded-xl shadow-lg ${colorMap[type]} text-white min-w-[120px] flex flex-col items-center justify-center m-2 relative group cursor-pointer ring-2 ring-amber-300 ring-offset-2`}
      >
        <span className="text-xs uppercase tracking-widest opacity-70 mb-1">{label}</span>
        <span className="text-lg font-bold text-center leading-tight">{text || userFill.l1}</span>
        <span className="absolute -top-2 -right-2 bg-amber-400 text-amber-900 text-[9px] font-black px-1.5 py-0.5 rounded-full">
          {userFill.source === 'suggested' ? t(sourceLang, 'youPicked') : t(sourceLang, 'youTyped')}
        </span>
        <button
          onClick={() => onUserFill?.({ l1: '', l2: '', source: 'typed' })}
          className="absolute -bottom-2 -right-2 bg-white text-slate-600 hover:text-slate-900 rounded-full p-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Clear fill"
          title="Clear and choose again"
        >
          <Pencil className="w-3 h-3" />
        </button>
      </motion.div>
    );
  }

  // ── Empty / inferred state ──
  if (isInferred) {
    return (
      <div className="relative m-2">
        <motion.div
          layout
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`p-4 rounded-xl border-2 border-dashed bg-white/40 ${dashedColorMap[type]} min-w-[140px] flex flex-col items-center justify-center`}
        >
          <span className="text-xs uppercase tracking-widest opacity-70 mb-1">{label}</span>
          <span className="text-xs text-center italic opacity-80 mb-2 leading-tight whitespace-pre-line">
            {t(sourceLang, 'youDidntSay', label)}
          </span>
          <button
            onClick={() => setPopoverOpen(v => !v)}
            className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${colorMap[type]} text-white hover:opacity-90 transition-opacity`}
          >
            <Lightbulb className="w-3 h-3" /> {t(sourceLang, 'suggest')}
          </button>
        </motion.div>

        <AnimatePresence>
          {popoverOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 space-y-2 text-left"
              onMouseLeave={() => setPopoverOpen(false)}
            >
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                {t(sourceLang, 'pickOrType', label)}
              </p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onUserFill?.({ l1: s.value_l1, l2: s.value_l2, source: 'suggested' });
                    setPopoverOpen(false);
                  }}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-50 transition-colors group/sug"
                >
                  <div className="text-sm font-bold text-slate-800 flex items-center justify-between">
                    {s.value_l1}
                    <Check className="w-3 h-3 text-slate-300 group-hover/sug:text-emerald-500" />
                  </div>
                  <div className="text-[11px] text-slate-500 italic mt-0.5 leading-snug">
                    {s.rationale}
                  </div>
                </button>
              ))}

              {editing ? (
                <div className="border-t border-slate-100 pt-2 space-y-2">
                  <input
                    autoFocus
                    type="text"
                    value={draftL1}
                    onChange={e => setDraftL1(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && draftL1.trim()) {
                        onUserFill?.({ l1: draftL1.trim(), l2: '', source: 'typed' });
                        setDraftL1('');
                        setEditing(false);
                        setPopoverOpen(false);
                      } else if (e.key === 'Escape') {
                        setEditing(false);
                      }
                    }}
                    placeholder={t(sourceLang, 'typePlaceholder', label)}
                    className="w-full p-2 text-sm rounded-md border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 italic px-1">{t(sourceLang, 'pressEnterToConfirm')}</p>
                </div>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="w-full text-left p-2 rounded-lg hover:bg-slate-50 transition-colors text-xs font-bold text-slate-500 flex items-center gap-1.5"
                >
                  <Pencil className="w-3 h-3" /> {t(sourceLang, 'typeYourOwn')}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Normal solid block (user-provided content) ──
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`p-4 rounded-xl shadow-lg ${colorMap[type]} text-white min-w-[120px] flex flex-col items-center justify-center m-2 relative group cursor-pointer`}
    >
      <span className="text-xs uppercase tracking-widest opacity-70 mb-1">{label}</span>
      <span className="text-lg font-bold text-center leading-tight">{text}</span>
    </motion.div>
  );
};
