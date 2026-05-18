"use client";

import React, { useEffect, useRef, useState } from 'react';
import {
  Loader2, AlertCircle, Plus, BookOpen, Download, Trash2, Pencil,
  Check, X, ChevronDown, Languages, User, Globe, Info, ChevronUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  t as tr, type SupportedLang, localizeLang, findDomainKey,
  type AgeKey, type DomainKey, AGE_DOMAINS, SUPPORTED_LANGS,
} from '../src/lib/ui-i18n';
import type { CoursewareManifest } from '../src/types/courseware';
import { HISTORY_PAGE_SIZE } from '../src/lib/constants';
import { ComboBox } from './ComboBox';

interface CourseSummary {
  slug: string;
  packageId: string;
  topic: string;
  ageGroup: string;
  domain: string;
  sourceLang: string;
  targetLang: string;
  createdAt: string;
  lessonCount: number;
  scriptCount: number;
}

const LANG_KEY: Record<SupportedLang, 'langEnglish' | 'langChinese' | 'langJapanese' | 'langKorean' | 'langVietnamese' | 'langSpanish' | 'langFrench' | 'langGerman'> = {
  English: 'langEnglish', Chinese: 'langChinese', Japanese: 'langJapanese',
  Korean: 'langKorean', Vietnamese: 'langVietnamese',
  Spanish: 'langSpanish', French: 'langFrench', German: 'langGerman',
};

const SPINE_COLORS = [
  'bg-amber-400', 'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-400', 'bg-teal-500',
  'bg-indigo-500', 'bg-pink-500',
];

const COVER_COLORS = [
  'from-amber-50 to-amber-100', 'from-blue-50 to-blue-100',
  'from-emerald-50 to-emerald-100', 'from-purple-50 to-purple-100',
  'from-rose-50 to-rose-100', 'from-cyan-50 to-cyan-100',
  'from-orange-50 to-orange-100', 'from-teal-50 to-teal-100',
  'from-indigo-50 to-indigo-100', 'from-pink-50 to-pink-100',
];

function hashIndex(str: string, len: number): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0x7fffffff;
  return h % len;
}

export interface CourseShelfProps {
  uiLang: SupportedLang;
  refreshKey?: number;
  onLoad: (course: CoursewareManifest & { packageId?: string; packageSlug?: string; sourceLang?: string; targetLang?: string }) => void;
  sourceLang: SupportedLang;
  targetLang: SupportedLang;
  ageGroup: AgeKey;
  domainText: string;
  courseInput: string;
  onCourseInputChange: (v: string) => void;
  generateAudio: boolean;
  generateImages: boolean;
  onGenerateAudioChange: (v: boolean) => void;
  onGenerateImagesChange: (v: boolean) => void;
  onSourceLangChange: (v: SupportedLang) => void;
  onTargetLangChange: (v: SupportedLang) => void;
  onAgeChange: (v: AgeKey) => void;
  onDomainChange: (v: DomainKey) => void;
  onDomainTextChange: (v: string) => void;
  loading: boolean;
  courseGenStep: string | null;
  fetchError: string | null;
  keyError: 'API_KEY_REQUIRED' | 'INVALID_API_KEY' | null;
  onGenerate: () => void;
  onOpenSettings: () => void;
  onClearKeyError: () => void;
}

export const CourseShelf = ({
  uiLang, refreshKey = 0, onLoad,
  sourceLang, targetLang, ageGroup, domainText, courseInput, onCourseInputChange,
  generateAudio, generateImages, onGenerateAudioChange, onGenerateImagesChange,
  onSourceLangChange, onTargetLangChange, onAgeChange, onDomainChange, onDomainTextChange,
  loading, courseGenStep, fetchError, keyError, onGenerate, onOpenSettings, onClearKeyError,
}: CourseShelfProps) => {
  const [items, setItems] = useState<CourseSummary[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [exportingSlug, setExportingSlug] = useState<string | null>(null);
  const [renamingSlug, setRenamingSlug] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) {
      const timer = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHasError(false);
    (async () => {
      try {
        const res = await fetch('/api/history/courses', { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error('failed');
        const payload: { courses: CourseSummary[] } = await res.json();
        if (!cancelled) setItems(payload.courses);
      } catch {
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleDelete = async (slug: string) => {
    if (!window.confirm(tr(uiLang, 'confirmDeleteCourse'))) return;
    setDeletingSlug(slug);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setItems((prev) => (prev ?? []).filter((c) => c.slug !== slug));
    } catch (err) {
      console.error('[CourseShelf] delete error:', err);
    } finally {
      setDeletingSlug(null);
    }
  };

  const startRename = (course: CourseSummary) => {
    setRenamingSlug(course.slug);
    setRenameValue(course.topic);
  };

  const cancelRename = () => { setRenamingSlug(null); setRenameValue(''); };

  const saveRename = async (slug: string, original: string) => {
    const next = renameValue.trim();
    if (!next || next === original) return cancelRename();
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(slug)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: next }),
      });
      if (!res.ok) throw new Error('rename failed');
      setItems((prev) => (prev ?? []).map((c) => (c.slug === slug ? { ...c, topic: next } : c)));
    } catch (err) {
      console.error('[CourseShelf] rename error:', err);
    } finally {
      cancelRename();
    }
  };

  const handleExport = async (slug: string) => {
    setExportingSlug(slug);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(slug)}/export`);
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${slug}.corefirst`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[CourseShelf] export error:', err);
    } finally {
      setExportingSlug(null);
    }
  };

  const handleLoad = async (slug: string) => {
    setLoadingSlug(slug);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error('load failed');
      const data = await res.json();
      onLoad(data);
    } catch (err) {
      console.error('[CourseShelf] load error:', err);
    } finally {
      setLoadingSlug(null);
    }
  };

  const handleSubmit = () => {
    onGenerate();
  };

  const list = items ?? [];
  const visibleItems = list.slice(0, visibleCount);
  const hasMore = list.length > visibleCount;

  return (
    <div className="space-y-6">
      {/* Inline creation form — expands when "New Tutorial" is clicked */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="bg-white border border-amber-200 rounded-3xl shadow-xl shadow-amber-100/50 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="bg-amber-100 p-1.5 rounded-lg text-amber-600">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <span className="font-black text-slate-800 text-sm uppercase tracking-wider">
                    {tr(uiLang, 'shelfNewCourse')}
                  </span>
                </div>
                <button
                  onClick={() => setExpanded(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  aria-label={tr(uiLang, 'cancel')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Language selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-2">
                  <label htmlFor="shelf-sourceLang" className="text-xs font-black uppercase text-blue-600 flex items-center gap-2">
                    <Languages className="w-3 h-3" /> {tr(uiLang, 'sourceLangLabel')}
                  </label>
                  <select
                    id="shelf-sourceLang"
                    value={sourceLang}
                    onChange={(e) => onSourceLangChange(e.target.value as SupportedLang)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  >
                    {SUPPORTED_LANGS.map(l => <option key={l} value={l}>{tr(uiLang, LANG_KEY[l])}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="shelf-targetLang" className="text-xs font-black uppercase text-emerald-600 flex items-center gap-2">
                    <Languages className="w-3 h-3" /> {tr(uiLang, 'targetLangLabel')}
                  </label>
                  <select
                    id="shelf-targetLang"
                    value={targetLang}
                    onChange={(e) => onTargetLangChange(e.target.value as SupportedLang)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  >
                    {SUPPORTED_LANGS.map(l => <option key={l} value={l}>{tr(uiLang, LANG_KEY[l])}</option>)}
                  </select>
                </div>
              </div>

              {/* Age + Domain */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-2">
                  <label htmlFor="shelf-ageGroup" className="text-xs font-black uppercase text-slate-400 flex items-center gap-2">
                    <User className="w-3 h-3" /> {tr(uiLang, 'ageGroupLabel')}
                  </label>
                  <select
                    id="shelf-ageGroup"
                    value={ageGroup}
                    onChange={(e) => onAgeChange(e.target.value as AgeKey)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  >
                    <option value="ageChild">{tr(uiLang, 'ageChild')}</option>
                    <option value="ageYoung">{tr(uiLang, 'ageYoung')}</option>
                    <option value="ageTeen">{tr(uiLang, 'ageTeen')}</option>
                    <option value="ageAdult">{tr(uiLang, 'ageAdult')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label htmlFor="shelf-domain" className="text-xs font-black uppercase text-slate-400 flex items-center gap-2">
                    <Globe className="w-3 h-3" /> {tr(uiLang, 'domainLabel')}
                  </label>
                  <ComboBox
                    uiLang={uiLang}
                    id="shelf-domain"
                    options={AGE_DOMAINS[ageGroup].map(key => ({
                      value: tr('English', key),
                      label: tr(uiLang, key),
                    }))}
                    value={findDomainKey(domainText) ? tr(uiLang, findDomainKey(domainText)!) : domainText}
                    onChange={(val) => {
                      const matchedKey = findDomainKey(val);
                      if (matchedKey) {
                        onDomainChange(matchedKey);
                      } else {
                        onDomainTextChange(val);
                      }
                    }}
                    placeholder={tr(uiLang, 'comboSearchPlaceholder')}
                    className="w-full"
                    inputClassName="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                  />
                </div>
              </div>

              {/* Topic input + submit */}
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  ref={inputRef}
                  type="text"
                  value={courseInput}
                  onChange={(e) => onCourseInputChange(e.target.value)}
                  placeholder={tr(uiLang, 'coursePlaceholder')}
                  className="flex-1 p-4 pl-5 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all text-base font-medium"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={loading || !courseInput.trim()}
                  className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-lg shadow-amber-200 flex items-center justify-center gap-2 uppercase tracking-wider whitespace-nowrap"
                >
                  {loading
                    ? <><Loader2 className="w-5 h-5 animate-spin" />{courseGenStep ? <span className="text-sm font-medium">{courseGenStep}</span> : null}</>
                    : tr(uiLang, 'btnGenerateCourse')}
                </button>
              </div>

              {/* Options */}
              <div className="flex items-center gap-5 -mt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <input type="checkbox" checked={generateAudio} onChange={(e) => onGenerateAudioChange(e.target.checked)} className="w-4 h-4 rounded accent-amber-500" />
                  <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700 uppercase tracking-wide">{tr(uiLang, 'audio')}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none group">
                  <input type="checkbox" checked={generateImages} onChange={(e) => onGenerateImagesChange(e.target.checked)} className="w-4 h-4 rounded accent-amber-500" />
                  <span className="text-xs font-bold text-slate-500 group-hover:text-slate-700 uppercase tracking-wide">{tr(uiLang, 'images')}</span>
                </label>
              </div>

              {loading && (
                <p className="text-xs text-slate-400">{tr(uiLang, 'courseGenWait')}</p>
              )}

              {fetchError && (
                <p className="text-sm text-red-600 font-medium flex items-center gap-2">
                  <Info className="w-4 h-4" /> {fetchError}
                </p>
              )}

              {keyError && (
                <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
                  <span className="text-amber-800">
                    {keyError === 'API_KEY_REQUIRED' ? tr(uiLang, 'errNoApiKey') : tr(uiLang, 'errApiKeyInvalid')}
                  </span>
                  <button
                    onClick={() => { onClearKeyError(); onOpenSettings(); }}
                    className="shrink-0 text-amber-700 font-medium hover:text-amber-900 underline underline-offset-2 transition-colors"
                  >
                    {keyError === 'API_KEY_REQUIRED' ? tr(uiLang, 'openSettings') : tr(uiLang, 'updateInSettings')}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bookshelf grid */}
      {historyLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
        </div>
      ) : hasError ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-slate-500 text-sm">{tr(uiLang, 'historyError')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-4">
          {/* New Tutorial card — always first */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className={`group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-all min-h-[180px] p-4
              ${expanded
                ? 'border-amber-400 bg-amber-50 shadow-md shadow-amber-100'
                : 'border-amber-200 bg-amber-50/50 hover:border-amber-400 hover:bg-amber-50 hover:shadow-md hover:shadow-amber-100'
              }`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors
              ${expanded ? 'bg-amber-400 text-white' : 'bg-amber-100 text-amber-500 group-hover:bg-amber-400 group-hover:text-white'}`}>
              {expanded ? <ChevronUp className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
            </div>
            <div className="text-center">
              <p className="font-black text-amber-700 text-sm leading-tight">{tr(uiLang, 'shelfNewCourse')}</p>
              {!expanded && (
                <p className="text-amber-500 text-[10px] font-medium mt-0.5 leading-tight">{tr(uiLang, 'shelfNewCourseHint')}</p>
              )}
            </div>
          </button>

          {/* Existing course books */}
          {visibleItems.map((course) => {
            const colorIdx = hashIndex(course.slug, SPINE_COLORS.length);
            const spineColor = SPINE_COLORS[colorIdx];
            const coverColor = COVER_COLORS[colorIdx];
            const isLoading = loadingSlug === course.slug;
            const isDeleting = deletingSlug === course.slug;
            const isRenaming = renamingSlug === course.slug;

            return (
              <div
                key={course.slug}
                className="group relative bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-lg hover:border-slate-200 transition-all overflow-hidden flex flex-col min-h-[180px]"
              >
                {/* Colored spine strip */}
                <div className={`h-2 w-full ${spineColor} shrink-0`} />

                {/* Cover area */}
                <div className={`flex-1 bg-gradient-to-b ${coverColor} p-4 flex flex-col gap-2`}>
                  {isRenaming ? (
                    <div className="flex flex-col gap-1.5 flex-1">
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(course.slug, course.topic);
                          if (e.key === 'Escape') cancelRename();
                        }}
                        className="w-full px-2 py-1 text-sm font-bold text-slate-900 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-200 bg-white"
                      />
                      <div className="flex gap-1">
                        <button onClick={() => saveRename(course.slug, course.topic)} className="p-1 text-amber-600 hover:bg-amber-100 rounded">
                          <Check className="w-3 h-3" />
                        </button>
                        <button onClick={cancelRename} className="p-1 text-slate-400 hover:bg-slate-100 rounded">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="font-black text-slate-800 text-sm leading-snug line-clamp-3 flex-1">
                      {course.topic}
                    </p>
                  )}

                  <div className="space-y-1 mt-auto">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      {localizeLang(course.sourceLang, uiLang)} → {localizeLang(course.targetLang, uiLang)}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {tr(uiLang, 'historyLessonCount', String(course.lessonCount))}
                    </p>
                  </div>
                </div>

                {/* Action bar — appears on hover */}
                <div className="absolute inset-0 bg-slate-900/80 rounded-2xl flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity p-3">
                  <button
                    onClick={() => handleLoad(course.slug)}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white text-slate-900 text-xs font-black uppercase tracking-wider hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
                    {tr(uiLang, 'historyLoadCourse')}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startRename(course)}
                      title={tr(uiLang, 'rename')}
                      className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleExport(course.slug)}
                      disabled={exportingSlug === course.slug}
                      title={tr(uiLang, 'btnExport')}
                      className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                    >
                      {exportingSlug === course.slug
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Download className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleDelete(course.slug)}
                      disabled={isDeleting}
                      title={tr(uiLang, 'delete')}
                      className="p-2 rounded-lg text-white/70 hover:text-red-400 hover:bg-white/10 transition-colors disabled:opacity-40"
                    >
                      {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && !historyLoading && (
        <button
          type="button"
          onClick={() => setVisibleCount((prev) => prev + HISTORY_PAGE_SIZE)}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-100 text-slate-400 text-xs font-black uppercase tracking-widest hover:border-amber-200 hover:text-amber-600 hover:bg-amber-50/50 transition-all flex items-center justify-center gap-2"
        >
          <ChevronDown className="w-4 h-4" />
          {tr(uiLang, 'historyMore')}
        </button>
      )}
    </div>
  );
};
