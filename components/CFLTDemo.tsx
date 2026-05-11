"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, Sparkles, ChevronRight } from 'lucide-react';
import { t, type SupportedLang } from '@/src/lib/ui-i18n';

type BlockType = 'core' | 'reason' | 'space' | 'time';

const TYPES: BlockType[] = ['core', 'reason', 'space', 'time'];
const COLOR: Record<BlockType, string> = {
  core: 'bg-cflt-core',
  reason: 'bg-cflt-reason',
  space: 'bg-cflt-space',
  time: 'bg-cflt-time',
};

interface CFLTDemoProps {
  // Natural native-language sentence — the everyday way a learner would say it.
  // Falls back to standardL2 when missing so older course packages still render.
  standardL1: string;
  // CRST-ordered native sentence (comma-separated four slots).
  cfltL1: string;
  // Final polished L2 sentence — revealed after the demo plays.
  standardL2: string;
  uiLang: SupportedLang;
  onContinue: () => void;
}

export const CFLTDemo: React.FC<CFLTDemoProps> = ({
  standardL1,
  cfltL1,
  standardL2: _standardL2,
  uiLang,
  onContinue,
}) => {
  const parts = useMemo(
    () => cfltL1.split(/[，,]/).map((p) => p.trim()).filter(Boolean).slice(0, 4),
    [cfltL1],
  );

  // Reveal one block at a time so the learner sees the sentence decompose
  // into its CRST elements rather than appearing as a finished puzzle.
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    setRevealed(0);
    if (parts.length === 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    parts.forEach((_, i) => {
      timers.push(setTimeout(() => setRevealed((r) => Math.max(r, i + 1)), 600 + i * 700));
    });
    return () => timers.forEach(clearTimeout);
  }, [parts]);

  const labelOf = (type: BlockType) => {
    const key = ({ core: 'slotCore', reason: 'slotReason', space: 'slotSpace', time: 'slotTime' } as const)[type];
    return t(uiLang, key);
  };

  const allRevealed = revealed >= parts.length && parts.length > 0;
  const nativeText = standardL1?.trim() || _standardL2;

  return (
    <div className="bg-gradient-to-b from-slate-50 to-white p-6 rounded-[2rem] border border-slate-100 space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] flex items-center gap-2">
          <Sparkles className="w-3 h-3 text-blue-500" />
          {t(uiLang, 'demoHeader')}
        </span>
        {!allRevealed && (
          <button
            onClick={() => setRevealed(parts.length)}
            className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700 transition-colors"
          >
            {t(uiLang, 'demoSkip')}
          </button>
        )}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-slate-100 text-center shadow-sm">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">
          {t(uiLang, 'naturalSentenceHeader')}
        </p>
        <p className="text-xl font-bold text-slate-800 leading-relaxed">"{nativeText}"</p>
      </div>

      <div className="flex justify-center">
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
          className="text-slate-300"
        >
          <ArrowDown className="w-5 h-5" />
        </motion.div>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest text-center mb-3">
          {t(uiLang, 'crstArrangementHeader')}
        </p>
        <div className="space-y-2">
          {parts.map((text, i) => {
            const type = TYPES[i] ?? 'space';
            const visible = i < revealed;
            return (
              <motion.div
                key={`${type}-${i}`}
                initial={{ opacity: 0, x: -16 }}
                animate={visible ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className={`flex items-center gap-3 p-3 rounded-xl ${COLOR[type]} text-white shadow-md`}
              >
                <span className="text-[10px] font-black uppercase tracking-widest opacity-70 min-w-[60px]">
                  {labelOf(type)}
                </span>
                <span className="text-base font-bold">{text}</span>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          onClick={onContinue}
          disabled={!allRevealed}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white px-6 py-3 rounded-xl font-black uppercase tracking-wider shadow-lg shadow-blue-900/10 transition-all active:scale-95 flex items-center gap-2"
        >
          {t(uiLang, 'demoContinue')} <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
