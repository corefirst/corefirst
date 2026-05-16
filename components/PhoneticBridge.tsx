'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Search, AlertTriangle } from 'lucide-react';
import { PINYIN_IPA_GROUPS, searchPinyin, type PhonemeEntry } from '@/src/lib/phonetics/pinyin-ipa';

import { t as tr, type SupportedLang } from '@/src/lib/ui-i18n';

interface Props {
  uiLang: SupportedLang;
  sourceLang?: string; // only show for Chinese speakers
}

function PhonemeRow({ entry }: { entry: PhonemeEntry }) {
  return (
    <div className={`grid grid-cols-[60px_80px_1fr_100px] gap-2 items-center px-3 py-2 rounded-lg text-sm ${entry.tricky ? 'bg-amber-50' : 'bg-white'}`}>
      <span className="font-black text-blue-700 font-mono">{entry.pinyin}</span>
      <span className="font-mono text-violet-600 text-xs">{entry.ipa}</span>
      <span className="text-gray-600 text-xs leading-snug">{entry.englishApprox}</span>
      <span className="text-gray-400 text-xs italic truncate">{entry.exampleEn}</span>
    </div>
  );
}

export function PhoneticBridge({ uiLang, sourceLang }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['Common Mistake Pairs']));

  // Only meaningful for Chinese speakers learning English
  if (sourceLang && sourceLang !== 'Chinese') return null;

  const searchResults = query.trim() ? searchPinyin(query) : null;

  const toggleGroup = (label: string) =>
    setExpandedGroups(s => {
      const next = new Set(s);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-slate-700 tracking-tight">{tr(uiLang, 'pinyinIpaReference')}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">{tr(uiLang, 'phoneticBridge')}</span>
        </div>
        {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={tr(uiLang, 'searchPhonetic')}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-[11px] text-slate-400 font-medium">
            <div className="grid grid-cols-[60px_80px_1fr_100px] gap-2 flex-1">
              <span className="font-black text-slate-500">{tr(uiLang, 'pinyin')}</span>
              <span className="font-black text-slate-500">{tr(uiLang, 'ipa')}</span>
              <span className="font-black text-slate-500">{tr(uiLang, 'englishApprox')}</span>
              <span className="font-black text-slate-500">{tr(uiLang, 'example')}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-200 inline-block" />
              <span>{tr(uiLang, 'trickySound')}</span>
            </div>
          </div>

          {/* Search results */}
          {searchResults !== null ? (
            searchResults.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">{tr(uiLang, 'comboNoResults', query)}</p>
            ) : (
              <div className="space-y-1">
                {searchResults.map((e, i) => <PhonemeRow key={i} entry={e} />)}
              </div>
            )
          ) : (
            /* Grouped view */
            <div className="space-y-2">
              {PINYIN_IPA_GROUPS.map(group => (
                <div key={group.label} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <button
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={expandedGroups.has(group.label)}
                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedGroups.has(group.label)
                        ? <ChevronDown size={13} className="text-slate-400" />
                        : <ChevronRight size={13} className="text-slate-400" />}
                      <span className="text-sm font-bold text-slate-800">{group.label}</span>
                      {group.label === 'Common Mistake Pairs' && (
                        <AlertTriangle size={12} className="text-amber-500" />
                      )}
                    </div>
                    {group.hint && (
                      <span className="text-[11px] text-slate-400 hidden md:block">{group.hint}</span>
                    )}
                  </button>
                  {expandedGroups.has(group.label) && (
                    <div className="border-t border-slate-100 px-2 py-1 space-y-0.5">
                      {group.items.map((e, i) => <PhonemeRow key={i} entry={e} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
