"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Reorder, motion } from 'framer-motion';
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { t as tr, type SupportedLang } from '@/src/lib/ui-i18n';

interface Block {
  id: string;
  text: string;
  type: string;
  correctIndex: number;
}

interface CFLTBuilderProps {
  cfltString: string;
  cfltL2?: string;
  uiLang: SupportedLang;
  onSuccess: () => void;
}

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleUntilChanged<T>(arr: T[]): T[] {
  if (arr.length <= 1) return arr;
  let result: T[];
  let attempts = 0;
  do {
    result = fisherYates(arr);
    attempts++;
  } while (
    attempts < 10 &&
    result.every((v, i) => (v as any).id === (arr[i] as any).id)
  );
  return result;
}

const BLOCK_COLOR: Record<string, string> = {
  core: 'bg-cflt-core', reason: 'bg-cflt-reason', space: 'bg-cflt-space', time: 'bg-cflt-time',
};

export const CFLTBuilder: React.FC<CFLTBuilderProps> = ({ cfltString, cfltL2, uiLang, onSuccess }) => {
  const [items, setItems] = useState<Block[]>([]);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const parts = cfltString.split(/[，,]/).filter(p => p.trim());
    const initialBlocks = parts.map((p, i) => ({
      id: `block-${i}`,
      text: p.trim(),
      type: ['core', 'reason', 'space', 'time'][i] || 'space',
      correctIndex: i
    }));
    setItems(shuffleUntilChanged(initialBlocks));
  }, [cfltString]);

  // Clear pending success callback on unmount to avoid state updates on dead component
  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const handleCheck = () => {
    const isOrderedCorrectly = items.every((item, index) => item.correctIndex === index);
    setIsCorrect(isOrderedCorrectly);
    if (isOrderedCorrectly) {
      successTimerRef.current = setTimeout(onSuccess, 1000);
    }
  };

  const handleReset = () => {
    setItems(prev => shuffleUntilChanged(prev));
    setIsCorrect(null);
  };

  const l2Parts = cfltL2
    ? cfltL2.split(/[，,]/).filter(p => p.trim()).slice(0, 4).map((text, i) => ({
        text: text.trim(),
        type: (['core', 'reason', 'space', 'time'] as const)[i] ?? 'space',
      }))
    : [];

  return (
    <div className="bg-slate-900 p-6 rounded-[2rem] shadow-2xl space-y-6">
      {l2Parts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">
            {tr(uiLang, 'targetMappingHeader')}
          </p>
          <div className="flex flex-wrap gap-2">
            {l2Parts.map(({ text, type }, i) => (
              <div key={i} className={`${BLOCK_COLOR[type]} text-white text-sm font-bold px-3 py-1.5 rounded-lg opacity-80`}>
                {text}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">
          {tr(uiLang, 'builderHeader')}
        </span>
        <button
          onClick={handleReset}
          aria-label="Shuffle blocks"
          className="text-slate-500 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <Reorder.Group
        axis="y"
        values={items}
        onReorder={setItems}
        className="space-y-3"
      >
        {items.map((item) => (
          <Reorder.Item
            key={item.id}
            value={item}
            className="cursor-grab active:cursor-grabbing"
          >
            <div className={`p-4 rounded-xl border-2 border-dashed ${
              isCorrect === true ? 'border-emerald-500 bg-emerald-500/10' :
              isCorrect === false ? 'border-red-500 bg-red-500/10' :
              'border-slate-700 bg-slate-800'
            } text-white font-bold flex items-center gap-4`}>
              <div className="w-2 h-2 rounded-full bg-slate-600" />
              {item.text}
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      <div className="pt-4 flex items-center justify-between">
        <button
          onClick={handleCheck}
          className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-black uppercase tracking-wider shadow-lg shadow-blue-900/20 transition-all active:scale-95"
        >
          {tr(uiLang, 'builderVerify')}
        </button>

        <div className="flex items-center gap-2">
          {isCorrect === true && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-2 text-emerald-400 font-bold">
              <CheckCircle2 className="w-5 h-5" /> {tr(uiLang, 'builderCorrect')}
            </motion.div>
          )}
          {isCorrect === false && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-2 text-red-400 font-bold">
              <AlertCircle className="w-5 h-5" /> {tr(uiLang, 'builderCheckSequence')}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};
