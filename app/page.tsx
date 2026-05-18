"use client";

import React, { useState, useEffect } from 'react';
import { CFLTBlock } from '../components/CFLTBlock';
import { CFLTVisual } from '../components/CFLTVisual';
import { VoiceChallenge } from '../components/VoiceChallenge';
import { ProgressDashboard } from '../components/ProgressDashboard';
import { CFLTBuilder } from '../components/CFLTBuilder';
import { CFLTDemo } from '../components/CFLTDemo';
import { CFLTChat } from '../components/CFLTChat';
import { TransformHistory } from '../components/TransformHistory';
import { RoleplayHistory } from '../components/RoleplayHistory';
import { CourseShelf } from '../components/CourseShelf';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { Settings } from '../components/Settings';
import { MarketPanel } from '../components/MarketPanel';
import { VocabReview } from '../components/VocabReview';
import { PhoneticBridge } from '../components/PhoneticBridge';
import { useSettings } from '../hooks/useSettings';
import {
  Loader2, Languages, Info, BookOpen, User, Globe, Library, ChevronLeft,
  Sparkles, PlayCircle, ChevronRight, BarChart3, MessageSquare, Settings as SettingsIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { CFLTResponse, CfltSlot } from '../src/types/cflt';
import type { CoursewareManifest, Lesson, LessonScript } from '../src/types/courseware';
import { t as tr, SUPPORTED_LANGS, detectUiLang, defaultLangPair, type SupportedLang, AGE_KEYS, type AgeKey, findAgeKey, type DomainKey, findDomainKey, DOMAIN_KEYS, AGE_DOMAINS } from '../src/lib/ui-i18n';
import { buildPlayableCflt, type SlotFillMap } from '../src/lib/cflt-playback';
import { consumeSSE } from '../src/lib/sse-reader';

const LANGUAGES = SUPPORTED_LANGS;
const UI_LANG_STORAGE_KEY = 'corefirst.uiLang';
const LANG_KEY: Record<SupportedLang, 'langEnglish' | 'langChinese' | 'langJapanese' | 'langKorean' | 'langVietnamese' | 'langSpanish' | 'langFrench' | 'langGerman'> = {
  English: 'langEnglish', Chinese: 'langChinese', Japanese: 'langJapanese',
  Korean: 'langKorean', Vietnamese: 'langVietnamese',
  Spanish: 'langSpanish', French: 'langFrench', German: 'langGerman',
};

export default function Home() {
  const [showSettings, setShowSettings] = useState(false);
  const [showVocabReview, setShowVocabReview] = useState(false);
  const [keyError, setKeyError] = useState<'API_KEY_REQUIRED' | 'INVALID_API_KEY' | null>(null);
  const { getHeaders } = useSettings();

  // T2: Cover & Recall training state
  const [recallMode, setRecallMode] = useState(false);
  const [recallAttempt, setRecallAttempt] = useState('');
  const [recallRevealed, setRecallRevealed] = useState(false);

  const [mode, setMode] = useState<'transform' | 'course' | 'stats' | 'roleplay' | 'market'>('transform');
  // Per-mode inputs — transform takes a sentence, course takes a topic; sharing
  // a single state would carry sentence-shaped text into the topic field (or
  // vice versa) when the learner switches tabs. Each mode keeps its own draft.
  const [transformInput, setTransformInput] = useState('');
  const [courseInput, setCourseInput] = useState('');
  const input = mode === 'course' ? courseInput : transformInput;
  const [loading, setLoading] = useState(false);
  const [transformResult, setTransformResult] = useState<CFLTResponse | null>(null);
  const [slotFills, setSlotFills] = useState<SlotFillMap>({});
  // Bumped after each successful transform so TransformHistory re-fetches
  // and shows the just-completed entry.
  const [transformHistoryKey, setTransformHistoryKey] = useState(0);
  const [courseHistoryKey, setCourseHistoryKey] = useState(0);
  // Standard sentence overrides after the user fills inferred CRST slots.
  // null = show original transformResult.standard_l2/standard_l1.
  const [refinedStandard, setRefinedStandard] = useState<{ standard_l1: string; standard_l2: string } | null>(null);
  // Per-slot resolved l1/l2 after refine — used so the L2 row of the CFLT
  // mapping displays the translated user fill (e.g. typed "因为锻炼身体" →
  // "to exercise") instead of echoing the L1 text or the AI's original
  // inference for a different reason.
  const [refinedSlots, setRefinedSlots] = useState<Array<{ type: CfltSlot['type']; l1: string; l2: string }> | null>(null);
  const [refining, setRefining] = useState(false);
  const [courseResult, setCourseResult] = useState<
    | (CoursewareManifest & {
        slug?: string;
        packageId?: string;
        packageSlug?: string;
        sessionId?: string;
      })
    | null
  >(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // UI language is decoupled from source/target. Default = system locale,
  // overridable via the header picker, persisted to localStorage. SSR-safe:
  // initial state is the SSR-rendered value ('English'), then the useEffect
  // below re-syncs to the persisted/detected value on the client.
  const [uiLang, setUiLang] = useState<SupportedLang>('English');

  const [ageGroup, setAgeGroup] = useState<AgeKey>('ageAdult');
  const [domain, setDomain] = useState<DomainKey>('indGeneral');
  // Free-text value sent to the API; kept in sync with domain key for predefined options.
  const [domainText, setDomainText] = useState<string>(() => tr('English', 'indGeneral'));
  const [sourceLang, setSourceLang] = useState<SupportedLang>('English');
  const [targetLang, setTargetLang] = useState<SupportedLang>('Chinese');

  useEffect(() => {
    try {
      const storedUi = window.localStorage.getItem(UI_LANG_STORAGE_KEY) as SupportedLang | null;
      const initialUi = storedUi && SUPPORTED_LANGS.includes(storedUi) ? storedUi : detectUiLang();
      setUiLang(initialUi);

      const storedAge = window.localStorage.getItem('corefirst.ageGroup');
      if (storedAge) {
        const key = (AGE_KEYS as readonly string[]).includes(storedAge)
          ? (storedAge as AgeKey)
          : findAgeKey(storedAge);
        if (key) handleAgeChange(key);
      }

      const storedInd = window.localStorage.getItem('corefirst.domain');
      if (storedInd) {
        const domainKey = (DOMAIN_KEYS as readonly string[]).includes(storedInd)
          ? (storedInd as DomainKey)
          : findDomainKey(storedInd);
        if (domainKey) handleDomainChange(domainKey);
      }

      const storedSrc = window.localStorage.getItem('corefirst.sourceLang') as SupportedLang | null;
      const storedTgt = window.localStorage.getItem('corefirst.targetLang') as SupportedLang | null;

      if (storedSrc && SUPPORTED_LANGS.includes(storedSrc)) setSourceLang(storedSrc);
      else setSourceLang(defaultLangPair(initialUi).source);

      if (storedTgt && SUPPORTED_LANGS.includes(storedTgt)) setTargetLang(storedTgt);
      else setTargetLang(defaultLangPair(initialUi).target);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const handleUiLangChange = (next: SupportedLang) => {
    setUiLang(next);
    try { window.localStorage.setItem(UI_LANG_STORAGE_KEY, next); } catch {}
    const pair = defaultLangPair(next);
    handleSourceLangChange(pair.source);
    handleTargetLangChange(pair.target);
  };

  const handleAgeChange = (next: AgeKey) => {
    setAgeGroup(next);
    try { window.localStorage.setItem('corefirst.ageGroup', next); } catch {}
    if (!(AGE_DOMAINS[next] as readonly string[]).includes(domain)) {
      handleDomainChange('indGeneral');
    }
  };

  const handleDomainChange = (next: DomainKey) => {
    setDomain(next);
    // Only overwrite domainText when it currently holds a predefined value.
    // Custom free-text input must survive implicit domain resets (e.g. age-group change).
    setDomainText(prev => (findDomainKey(prev) !== undefined || prev === '' ? tr('English', next) : prev));
    try { window.localStorage.setItem('corefirst.domain', next); } catch {}
  };

  const handleSourceLangChange = (next: SupportedLang) => {
    setSourceLang(next);
    try { window.localStorage.setItem('corefirst.sourceLang', next); } catch {}
  };

  const handleTargetLangChange = (next: SupportedLang) => {
    setTargetLang(next);
    try { window.localStorage.setItem('corefirst.targetLang', next); } catch {}
  };

  const [generateAudio, setGenerateAudio] = useState(true);
  const [generateImages, setGenerateImages] = useState(true);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [courseGenStep, setCourseGenStep] = useState<string | null>(null); // progress hint during course generation
  const [completedPuzzles, setCompletedPuzzles] = useState<Set<string>>(new Set());
  // Per-lesson toggle between the learning demo and the rearrange-the-blocks
  // practice exercise. Keyed by lesson index so different lessons can be in
  // different modes independently.
  const [lessonMode, setLessonMode] = useState<Record<number, 'learn' | 'practice'>>({});

  // T3: Restore puzzle completion state from server when a course is loaded
  useEffect(() => {
    const slug = courseResult?.slug ?? courseResult?.packageSlug;
    if (!slug) { setCompletedPuzzles(new Set()); return; }
    fetch(`/api/progress/puzzles?slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(({ completed }: { completed: string[] }) => {
        if (completed.length > 0) setCompletedPuzzles(new Set(completed));
      })
      .catch(() => {});
  }, [courseResult?.slug, courseResult?.packageSlug]);

  // When the user fills inferred CRST slots, ask the server to re-render the
  // standard sentence using all four confirmed slot contents. Debounced so
  // pick-then-pick-again only fires once. Skipped unless every inferred slot
  // has a fill (an incomplete sentence isn't worth re-rendering).
  useEffect(() => {
    if (!transformResult?.slots) return;
    const settled = transformResult.slots.map((s) => {
      if (!s.is_inferred) return { type: s.type, l1: s.content_l1, l2: s.content_l2 };
      const fill = slotFills[s.type];
      if (!fill) return null;
      return { type: s.type, l1: fill.l1, l2: fill.l2 };
    });
    if (settled.some((s) => s === null)) {
      // Some slot was just cleared — drop stale refined values so the UI falls
      // back to the AI's original mapping until the learner refills.
      setRefinedSlots(null);
      setRefinedStandard(null);
      return;
    }
    // Only refine when at least one slot was actually a user fill — otherwise
    // we'd just round-trip the model's original output for no gain.
    const anyUserFill = transformResult.slots.some((s) => s.is_inferred && slotFills[s.type]);
    if (!anyUserFill) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRefining(true);
      try {
        const res = await fetch('/api/transform/refine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getHeaders() },
          body: JSON.stringify({ sourceLang, targetLang, uiLang, slots: settled }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Refine failed');
        const data: {
          standard_l1: string;
          standard_l2: string;
          slots?: Array<{ type: CfltSlot['type']; l1: string; l2: string }>;
        } = await res.json();
        setRefinedStandard({ standard_l1: data.standard_l1, standard_l2: data.standard_l2 });
        if (data.slots) setRefinedSlots(data.slots);
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') {
          console.error('[refine] Error:', err);
        }
      } finally {
        setRefining(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slotFills, transformResult, sourceLang, targetLang, uiLang]);

  const markPuzzleComplete = async (id: string, lessonIndex: number, scriptIndex: number) => {
    setCompletedPuzzles(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    if (courseResult) {
      try {
        await fetch('/api/progress/complete-puzzle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packageId: courseResult.packageId,
            packageSlug: courseResult.packageSlug,
            lessonIndex,
            scriptIndex,
          }),
        });
      } catch (err) {
        console.error('[markPuzzleComplete] Failed to sync to server:', err);
      }
    }
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
      audio.onended = () => { URL.revokeObjectURL(url!); url = null; };
      audio.onerror = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
      await audio.play();
    } catch (error) {
      console.error('[playAudio] Error:', error);
      if (url) URL.revokeObjectURL(url);
    } finally {
      setAudioLoading(null);
    }
  };

  // Plays a pre-rendered audio asset (e.g. /api/courses/:slug/audio/:lesson/:script)
  // straight from a URL — no /api/tts round-trip. Used by history-loaded courses
  // where the .corefirst package already ships an mp3 per script.
  const playAudioFromUrl = async (audioUrl: string, id: string) => {
    setAudioLoading(id);
    try {
      const audio = new Audio(audioUrl);
      await audio.play();
    } catch (error) {
      console.error('[playAudioFromUrl] Error:', error);
    } finally {
      setAudioLoading(null);
    }
  };

  const handleTransform = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setFetchError(null);
    setKeyError(null);
    try {
      const response = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({
          text: input,
          sourceLang,
          targetLang,
          uiLang,
          packageSlug: courseResult?.slug // Link to current course if active
        }),
      });
      if (response.status === 401) {
        const data = await response.json();
        setKeyError(data.error);
        return;
      }
      if (!response.ok) throw new Error('Transformation failed');
      const data: CFLTResponse = await response.json();
      setTransformResult(data);
      setSlotFills({});
      setRefinedStandard(null);
      setRefinedSlots(null);
      setRecallMode(false);
      setRecallAttempt('');
      setRecallRevealed(false);
      setTransformHistoryKey((k) => k + 1);
    } catch (error) {
      console.error(error);
      setFetchError(tr(uiLang, 'errorTransform'));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCourse = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setFetchError(null);
    setKeyError(null);
    setCourseGenStep(tr(uiLang, 'courseGenStepDesigning'));
    try {
      const response = await fetch('/api/generate-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ topic: input, age_group: tr('English', ageGroup), domain_context: domainText || tr('English', domain), sourceLang, targetLang, generateAudio, generateImages }),
      });
      if (response.status === 401) {
        const data = await response.json().catch(() => ({}));
        setKeyError(data.error ?? 'API_KEY_REQUIRED');
        return;
      }
      if (!response.ok || !response.body) throw new Error('Course generation failed');

      // Consume SSE stream and update step label in real time
      await consumeSSE(response.body.getReader(), (event) => {
        if (event.type === 'step') {
          setCourseGenStep(event.message as string);
        } else if (event.type === 'complete') {
          setCourseResult(event.result as typeof courseResult);
          setCourseHistoryKey((k) => k + 1);
          return true; // stop reading
        } else if (event.type === 'error') {
          throw new Error((event.message as string) ?? 'Course generation failed');
        }
      });
    } catch (error) {
      console.error(error);
      setFetchError(tr(uiLang, 'errorCourse'));
    } finally {
      setCourseGenStep(null);
      setLoading(false);
    }
  };

  // Legacy renderer for code paths that only have a CFLT string (course mode
  // dialogue scripts, etc.). Splits on commas, no inferred-slot UX.
  const renderBlocks = (cfltString: string) => {
    if (!cfltString) return null;
    const parts = cfltString.split(/[，,]/).filter(p => p.trim());
    const labels = ['Core', 'Reason', 'Space', 'Time'];
    const types: ('core' | 'reason' | 'space' | 'time')[] = ['core', 'reason', 'space', 'time'];

    return parts.map((part, index) => (
      <CFLTBlock
        key={index}
        type={types[index] || 'space'}
        label={labels[index] || 'Extra'}
        text={part.trim()}
      />
    ));
  };

  // Structured renderer for transform mode. Uses the per-slot data so we can
  // hide LLM-inferred content behind an empty slot + suggestions popover —
  // the learner has to engage with the gap, not consume a guess.
  const renderSlots = (slots: CfltSlot[], lang: 'l1' | 'l2') => {
    // Block labels are CHROME — they tell the learner what category each slot
    // is. Always rendered in the UI language regardless of which language pair
    // is being practiced.
    const labelOf = (type: 'core' | 'reason' | 'space' | 'time') => {
      const key = ({ core: 'slotCore', reason: 'slotReason', space: 'slotSpace', time: 'slotTime' } as const)[type];
      return tr(uiLang, key);
    };
    return slots.map((slot, index) => {
      const fill = slotFills[slot.type];
      const refined = refinedSlots?.find(r => r.type === slot.type);
      // Priority: refined (post-refine resolved value) > userFill > AI inference.
      // Refine fills in translations for typed entries so the L2 row reads in
      // the target language even when the learner only typed L1.
      const text = lang === 'l1'
        ? (refined?.l1 || fill?.l1 || slot.content_l1)
        : (refined?.l2 || fill?.l2 || slot.content_l2);
      return (
        <CFLTBlock
          key={`${slot.type}-${index}-${lang}`}
          type={slot.type}
          label={labelOf(slot.type)}
          text={text}
          isInferred={slot.is_inferred}
          suggestions={slot.suggestions}
          userFill={fill ?? null}
          sourceLang={uiLang}
          onUserFill={(v) => {
            setSlotFills(prev => ({
              ...prev,
              [slot.type]: v.l1 ? v : null,
            }));
          }}
        />
      );
    });
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900">
      {showSettings && <Settings uiLang={uiLang} onClose={() => setShowSettings(false)} />}

      {showVocabReview && <VocabReview targetLang={targetLang} uiLang={uiLang} onClose={() => setShowVocabReview(false)} />}

      <div className="px-4 md:px-8 pt-2 md:pt-4 pb-4 md:pb-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Header: Left = Logo (spans 2 rows), Right = Controls top + Nav tabs bottom */}
        <div className="flex flex-col md:flex-row md:items-stretch gap-4 pb-6 border-b border-slate-200">
          {/* Left: Logo — vertically centered across both right rows */}
          <div className="flex items-center gap-3 shrink-0">
            <img src="/corefirst-logo.svg" alt="CoreFirst" className="w-12 h-12" />
            <div>
              <h1 className="text-2xl font-black tracking-tight uppercase">CoreFirst</h1>
              <p className="text-xs text-slate-400 font-bold tracking-widest uppercase">{tr(uiLang, 'tagline')}</p>
            </div>
          </div>

          {/* Right: two stacked rows */}
          <div className="flex-1 flex flex-col justify-between gap-2">
            {/* Row 1: Language + User + Settings — compact, right-aligned */}
            <div className="flex items-center justify-end gap-1.5">
              <label className="relative" title={tr(uiLang, 'uiLangLabel')}>
                <span className="sr-only">{tr(uiLang, 'uiLangLabel')}</span>
                <Globe className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
                <select
                  value={uiLang}
                  onChange={(e) => handleUiLangChange(e.target.value as SupportedLang)}
                  className="pl-6 pr-2 py-1 rounded-lg bg-slate-100 border-0 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400 transition-all"
                  aria-label={tr(uiLang, 'uiLangLabel')}
                >
                  {LANGUAGES.map(l => (
                    <option key={l} value={l}>{tr(uiLang, LANG_KEY[l])}</option>
                  ))}
                </select>
              </label>
              <ProfileSwitcher uiLang={uiLang} compact />
              <button
                onClick={() => setShowSettings(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title={tr(uiLang, 'settings')}
              >
                <SettingsIcon size={15} />
              </button>
            </div>

            {/* Row 2: Nav tabs — right-aligned, dark active state */}
            <div className="flex items-center justify-end gap-0.5 overflow-x-auto">
              <button
                onClick={() => setMode('transform')}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap ${mode === 'transform' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/80'}`}
              >
                <Sparkles className="w-3.5 h-3.5" /> {tr(uiLang, 'tabTransform')}
              </button>
              <button
                onClick={() => setMode('course')}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap ${mode === 'course' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/80'}`}
              >
                <BookOpen className="w-3.5 h-3.5" /> {tr(uiLang, 'tabCourse')}
              </button>
              <button
                onClick={() => setMode('roleplay')}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap ${mode === 'roleplay' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/80'}`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> {tr(uiLang, 'tabRoleplay')}
              </button>
              <button
                onClick={() => setMode('stats')}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap ${mode === 'stats' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/80'}`}
              >
                <BarChart3 className="w-3.5 h-3.5" /> {tr(uiLang, 'tabStats')}
              </button>
              <button
                onClick={() => setMode('market')}
                className={`px-3.5 py-1.5 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 whitespace-nowrap ${mode === 'market' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/80'}`}
              >
                <Library className="w-3.5 h-3.5" /> {tr(uiLang, 'tabMarket')}
              </button>
            </div>
          </div>
        </div>

        {/* Controls — transform mode only */}
        {mode === 'transform' && (
          <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-white space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-slate-100">
              <div className="space-y-2">
                <label
                  htmlFor="sourceLang"
                  className="text-xs font-black uppercase text-blue-600 flex items-center gap-2"
                >
                  <Languages className="w-3 h-3" /> {tr(uiLang, 'sourceLangLabel')}
                </label>
                <select
                  id="sourceLang"
                  value={sourceLang}
                  onChange={(e) => handleSourceLangChange(e.target.value as SupportedLang)}
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                >
                  {LANGUAGES.map(l => <option key={l} value={l}>{tr(uiLang, LANG_KEY[l])}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="targetLang"
                  className="text-xs font-black uppercase text-emerald-600 flex items-center gap-2"
                >
                  <Languages className="w-3 h-3" /> {tr(uiLang, 'targetLangLabel')}
                </label>
                <select
                  id="targetLang"
                  value={targetLang}
                  onChange={(e) => handleTargetLangChange(e.target.value as SupportedLang)}
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
                >
                  {LANGUAGES.map(l => <option key={l} value={l}>{tr(uiLang, LANG_KEY[l])}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={transformInput}
                  onChange={(e) => setTransformInput(e.target.value)}
                  placeholder={tr(uiLang, 'transformPlaceholder')}
                  className="w-full p-4 pl-6 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-lg font-medium"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleTransform();
                    }
                  }}
                />
              </div>
              <button
                onClick={handleTransform}
                disabled={loading}
                title={tr(uiLang, 'submitHint')}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white px-10 py-4 rounded-2xl font-black transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-3 uppercase tracking-wider"
              >
                {loading ? <Loader2 className="animate-spin" /> : tr(uiLang, 'btnTransform')}
              </button>
            </div>

            <p className="text-xs text-slate-400 -mt-2">{tr(uiLang, 'submitHint')}</p>

            {fetchError && (
              <p className="text-sm text-red-600 font-medium flex items-center gap-2">
                <Info className="w-4 h-4" /> {fetchError}
              </p>
            )}

            {keyError && (
              <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
                <span className="text-amber-800">
                  {keyError === 'API_KEY_REQUIRED'
                    ? tr(uiLang, 'errNoApiKey')
                    : tr(uiLang, 'errApiKeyInvalid')}
                </span>
                <button
                  onClick={() => { setKeyError(null); setShowSettings(true); }}
                  className="shrink-0 text-amber-700 font-medium hover:text-amber-900 underline underline-offset-2 transition-colors"
                >
                  {keyError === 'API_KEY_REQUIRED' ? tr(uiLang, 'openSettings') : tr(uiLang, 'updateInSettings')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* L3: Learning funnel guide — shown to new users before first result */}
        {mode === 'transform' && !transformResult && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { step: '1', tab: 'transform' as const, icon: Sparkles, title: tr(uiLang, 'guideTransformTitle'), desc: tr(uiLang, 'guideTransformDesc') },
              { step: '2', tab: 'course' as const, icon: BookOpen, title: tr(uiLang, 'guideCourseTitle'), desc: tr(uiLang, 'guideCourseDesc') },
              { step: '3', tab: 'roleplay' as const, icon: MessageSquare, title: tr(uiLang, 'guideRoleplayTitle'), desc: tr(uiLang, 'guideRoleplayDesc') },
            ].map(({ step, tab, icon: Icon, title, desc }) => (
              <button
                key={step}
                onClick={() => setMode(tab)}
                className={`text-left p-5 rounded-2xl border transition-all hover:shadow-md ${mode === tab ? 'border-blue-300 bg-blue-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-black flex items-center justify-center">{step}</span>
                  <Icon className="w-4 h-4 text-blue-500" />
                  <span className="font-black text-sm text-slate-800">{title}</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div className="space-y-8">
          {mode === 'stats' && <ProgressDashboard uiLang={uiLang} onNavigate={(tab) => setMode(tab)} onReview={() => setShowVocabReview(true)} />}
          {mode === 'market' && <MarketPanel />}
          {mode === 'roleplay' && (
            <>
              <CFLTChat
                sourceLang={sourceLang}
                targetLang={targetLang}
                uiLang={uiLang}
                packageSlug={courseResult?.slug}
                packageId={courseResult?.packageId}
                onOpenSettings={() => setShowSettings(true)}
              />
              <RoleplayHistory uiLang={uiLang} />
            </>
          )}          {mode === 'transform' && transformResult && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-white space-y-8 text-center">
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase text-slate-400 tracking-[0.2em]">{tr(uiLang, 'cfltThinkingHeader')}</h3>
                  <div className="flex flex-wrap items-end justify-center gap-2">
                    {transformResult.slots
                      ? renderSlots(transformResult.slots, 'l1')
                      : renderBlocks(transformResult.cflt_l1)}
                  </div>
                  {transformResult.slots?.some(s => s.is_inferred) && (
                    <p className="text-xs text-slate-400 italic max-w-md mx-auto">
                      {tr(uiLang, 'inferredFooter')}
                    </p>
                  )}
                </div>
                <div className="h-px bg-slate-100 w-1/2 mx-auto"></div>
                <div className="space-y-4">
                  <h3 className="text-sm font-black uppercase text-slate-400 tracking-[0.2em]">{tr(uiLang, 'targetMappingHeader')}</h3>
                  <div className="flex flex-wrap items-end justify-center gap-2">
                    {transformResult.slots
                      ? renderSlots(transformResult.slots, 'l2')
                      : renderBlocks(transformResult.cflt_l2)}
                  </div>
                  <button
                    onClick={() => playAudio(buildPlayableCflt(transformResult, slotFills, 'l2'), 'transform-cflt-l2')}
                    disabled={audioLoading === 'transform-cflt-l2'}
                    aria-label="Play CFLT sentence"
                    className="text-slate-400 hover:text-blue-600 transition-colors disabled:text-slate-200 mx-auto block"
                  >
                    {audioLoading === 'transform-cflt-l2' ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <PlayCircle className="w-6 h-6" />
                    )}
                  </button>
                </div>
                {recallMode && !recallRevealed ? (
                  /* T2: Cover & Recall — hide answer, user attempts from memory */
                  <div className="bg-slate-800 p-8 rounded-3xl text-white space-y-4">
                    <p className="text-xs font-bold opacity-60 uppercase tracking-widest text-center">
                      {tr(uiLang, 'howToSayIn', targetLang)}
                    </p>
                    <textarea
                      value={recallAttempt}
                      onChange={e => setRecallAttempt(e.target.value)}
                      placeholder={tr(uiLang, 'typeSentenceFromStructure', targetLang)}
                      className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-white placeholder-white/40 resize-none focus:outline-none focus:ring-2 focus:ring-white/40 text-lg font-medium"
                      rows={3}
                      autoFocus
                    />
                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => setRecallRevealed(true)}
                        className="px-6 py-2.5 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors"
                      >
                        {tr(uiLang, 'btnRevealAnswer')}
                      </button>
                      <button
                        onClick={() => { setRecallMode(false); setRecallAttempt(''); }}
                        className="px-6 py-2.5 bg-white/10 text-white rounded-xl font-bold text-sm hover:bg-white/20 transition-colors"
                      >
                        {tr(uiLang, 'cancel')}
                      </button>
                    </div>
                  </div>
                ) : recallMode && recallRevealed ? (
                  /* T2: Show comparison */
                  <div className="space-y-3">
                    {recallAttempt && (
                      <div className="bg-slate-100 p-5 rounded-2xl">
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">{tr(uiLang, 'yourAttempt')}</p>
                        <p className="text-xl font-bold text-slate-700 italic">"{recallAttempt}"</p>
                      </div>
                    )}
                    <div className="bg-blue-600 p-8 rounded-3xl text-white shadow-2xl shadow-blue-200">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <p className="text-xs font-bold opacity-60 uppercase tracking-widest text-center">
                          {tr(uiLang, 'standardCorrectAnswer', targetLang)}
                        </p>
                        {refining && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
                      </div>
                      <p className="text-3xl font-black italic">"{refinedStandard?.standard_l2 ?? transformResult.standard_l2}"</p>
                      <button
                        onClick={() => playAudio(refinedStandard?.standard_l2 ?? transformResult.standard_l2, 'transform-result')}
                        disabled={audioLoading === 'transform-result' || refining}
                        className="mt-4 text-white/60 hover:text-white transition-colors disabled:text-white/20 mx-auto block"
                      >
                        {audioLoading === 'transform-result' ? <Loader2 className="w-8 h-8 animate-spin" /> : <PlayCircle className="w-8 h-8" />}
                      </button>
                    </div>
                    <button
                      onClick={() => { setRecallMode(false); setRecallAttempt(''); setRecallRevealed(false); }}
                      className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition-colors font-medium"
                    >
                      {tr(uiLang, 'btnDone')}
                    </button>
                  </div>
                ) : (
                  /* Normal result view */
                  <div className="bg-blue-600 p-8 rounded-3xl text-white shadow-2xl shadow-blue-200">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <p className="text-xs font-bold opacity-60 uppercase tracking-widest text-center">{tr(uiLang, 'standardResultHeader', targetLang)}</p>
                      {refining && <Loader2 className="w-3 h-3 animate-spin opacity-60" />}
                    </div>
                    <p className="text-3xl font-black italic">"{refinedStandard?.standard_l2 ?? transformResult.standard_l2}"</p>
                    <div className="flex items-center justify-center gap-4 mt-4">
                      <button
                        onClick={() => playAudio(refinedStandard?.standard_l2 ?? transformResult.standard_l2, 'transform-result')}
                        disabled={audioLoading === 'transform-result' || refining}
                        aria-label={tr(uiLang, 'ariaPlaySentence')}                        className="text-white/60 hover:text-white transition-colors disabled:text-white/20"
                      >
                        {audioLoading === 'transform-result' ? <Loader2 className="w-8 h-8 animate-spin" /> : <PlayCircle className="w-8 h-8" />}
                      </button>
                      <button
                        onClick={() => { setRecallMode(true); setRecallAttempt(''); setRecallRevealed(false); }}
                        className="text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white border border-white/30 hover:border-white/60 px-3 py-1.5 rounded-lg transition-colors"
                        title={tr(uiLang, 'btnTestYourselfHint')}
                      >
                        {tr(uiLang, 'btnTestYourself')}
                      </button>                    </div>
                  </div>
                )}
              </div>
              <VoiceChallenge
                uiLang={uiLang}
                expectedText={refinedStandard?.standard_l2 ?? transformResult.standard_l2}
                sourceLang={sourceLang}
                targetLang={targetLang}
              />
              {/* T8: Phonetic Bridge — shown for Chinese → English learners */}
              <PhoneticBridge uiLang={uiLang} sourceLang={sourceLang} />
            </div>
          )}

          {/* CTAs after Transform result: Roleplay + Course */}
          {mode === 'transform' && transformResult && (
            <div className="flex items-center justify-end gap-4">
              <button
                onClick={() => { setCourseInput(transformInput); setMode('course'); }}
                className="flex items-center gap-2 text-sm text-slate-500 font-bold hover:text-slate-700 transition-colors"
              >
                <BookOpen className="w-4 h-4" />
                {tr(uiLang, 'btnBuildCourse')}
              </button>
              <button
                onClick={() => setMode('roleplay')}
                className="flex items-center gap-2 text-sm text-blue-600 font-bold hover:text-blue-800 transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                {tr(uiLang, 'btnPracticeRoleplay')}
              </button>            </div>
          )}

          {mode === 'transform' && <TransformHistory uiLang={uiLang} refreshKey={transformHistoryKey} />}

          {mode === 'course' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {courseResult ? (
                <>
                  <div className="flex items-center justify-between bg-white p-6 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-white">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{tr(uiLang, 'tabCourse')}</h2>
                        <p className="text-slate-900 font-black leading-none">{courseResult.topic}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setCourseResult(null);
                        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-black uppercase tracking-wider transition-colors group"
                    >
                      <Library className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                      {tr(uiLang, 'library')}
                    </button>
                  </div>

                  <div className="space-y-8">
                    {courseResult.lessons.map((lesson: Lesson, i: number) => (
                      <div key={i} className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-white space-y-8">

                        {(lesson.imageUrl || lesson.visual_generation_prompts?.[0]) && (
                          <CFLTVisual
                            prompt={lesson.visual_generation_prompts?.[0] ?? ''}
                            uiLang={uiLang}
                            imageUrl={lesson.imageUrl}
                          />
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="bg-blue-100 text-blue-600 w-10 h-10 rounded-full flex items-center justify-center font-black">
                              {i + 1}
                            </div>
                            <h2 className="text-2xl font-black text-slate-800">{lesson.title}</h2>
                          </div>
                          <div className="bg-slate-100 px-4 py-1 rounded-full text-[10px] font-black uppercase text-slate-400 tracking-wider">
                            {tr(uiLang, 'labelLessonScenario')}
                          </div>
                        </div>

                        <p className="text-slate-500 font-medium leading-relaxed bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-200">
                          {lesson.scenario_description}
                        </p>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {(lessonMode[i] ?? 'learn') === 'practice' && (
                              <span className="text-xs font-bold text-slate-400 italic">
                                {tr(uiLang, 'practiceHint')}
                              </span>
                            )}
                          </div>
                          <div className="flex bg-slate-100 p-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0">
                            <button
                              onClick={() => setLessonMode(prev => ({ ...prev, [i]: 'learn' }))}
                              className={`px-3 py-1 rounded-md transition-colors ${(lessonMode[i] ?? 'learn') === 'learn' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                              {tr(uiLang, 'modeLearning')}
                            </button>
                            <button
                              onClick={() => setLessonMode(prev => ({ ...prev, [i]: 'practice' }))}
                              className={`px-3 py-1 rounded-md transition-colors ${(lessonMode[i] ?? 'learn') === 'practice' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                              {tr(uiLang, 'modePractice')}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-4">
                          {lesson.cflt_scripts.map((script: LessonScript, j: number) => {
                            const puzzleId = `puzzle-${i}-${j}`;
                            const isComplete = completedPuzzles.has(puzzleId);
                            const activeMode = lessonMode[i] ?? 'learn';

                            return (
                              <div key={j} className="group relative bg-white border border-slate-100 p-6 rounded-3xl hover:border-blue-200 transition-all hover:shadow-lg hover:shadow-blue-50">
                                {!isComplete ? (
                                  <div className="space-y-4">
                                    <div className="flex items-center gap-2 flex-wrap mb-2">
                                      <span className="text-[10px] font-black uppercase bg-slate-200 text-slate-500 px-2 py-0.5 rounded inline-flex items-center gap-1">
                                        <User className="w-3 h-3" />{script.speaker}
                                      </span>
                                    </div>
                                    {activeMode === 'learn' ? (
                                      <CFLTDemo
                                        standardL1={script.standard_l1 || ''}
                                        cfltL1={script.cflt_l1}
                                        cfltL2={script.cflt_l2}
                                        standardL2={script.standard_l2}
                                        uiLang={uiLang}
                                        onContinue={() => markPuzzleComplete(puzzleId, i, j)}
                                      />
                                    ) : (
                                      <CFLTBuilder
                                        uiLang={uiLang}
                                        cfltString={script.cflt_l1}
                                        cfltL2={script.cflt_l2}
                                        onSuccess={() => markPuzzleComplete(puzzleId, i, j)}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <div className="flex items-start justify-between mb-4">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[10px] font-black uppercase bg-slate-900 text-white px-2 py-0.5 rounded inline-flex items-center gap-1 shrink-0">
                                          <User className="w-3 h-3" />{script.speaker}
                                        </span>
                                        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                                        <span className="text-xl font-black text-slate-800 italic">
                                          "{script.standard_l2}"
                                        </span>
                                      </div>
                                      <button
                                        onClick={() => script.audioUrl
                                          ? playAudioFromUrl(script.audioUrl, `audio-${i}-${j}`)
                                          : playAudio(script.ssml, `audio-${i}-${j}`)}
                                        disabled={audioLoading === `audio-${i}-${j}`}
                                        aria-label="Play audio"
                                        className="text-blue-500 hover:text-blue-700 transition-colors disabled:text-slate-300"
                                      >
                                        {audioLoading === `audio-${i}-${j}` ? (
                                          <Loader2 className="w-8 h-8 animate-spin" />
                                        ) : (
                                          <PlayCircle className="w-8 h-8" />
                                        )}
                                      </button>
                                    </div>
                                    <div className="space-y-4">
                                      <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                                          {tr(uiLang, 'cfltThinkingHeader')}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                          {renderBlocks(script.cflt_l1)}
                                        </div>
                                      </div>
                                      <div className="space-y-2">
                                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
                                          {tr(uiLang, 'targetMappingHeader')}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                          {renderBlocks(script.cflt_l2)}
                                        </div>
                                      </div>
                                    </div>

                                    <VoiceChallenge
                                      uiLang={uiLang}
                                      expectedText={script.standard_l2}
                                      sourceLang={sourceLang}
                                      targetLang={targetLang}
                                      packageSlug={courseResult.packageSlug}
                                      lessonIndex={i}
                                      scriptIndex={j}
                                      sessionId={courseResult.sessionId}
                                    />
                                  </motion.div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-slate-50">
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
                              <Sparkles className="w-3 h-3 text-amber-500" /> {tr(uiLang, 'labelVocabTokens')}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {lesson.vocabulary_focus.map((v, k: number) => (
                                <div key={k} className="bg-slate-100 px-3 py-1.5 rounded-lg text-sm font-bold text-slate-700">
                                  {v.token} <span className="opacity-40 font-normal ml-1">({v.meaning})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Quick toggle at bottom too for convenience */}
                  <div className="flex justify-center pt-4">
                    <button
                      onClick={() => {
                        setCourseResult(null);
                        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all font-black uppercase text-xs tracking-widest"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      {tr(uiLang, 'library')}
                    </button>
                  </div>
                </>
              ) : (
                <CourseShelf
                  uiLang={uiLang}
                  refreshKey={courseHistoryKey}
                  sourceLang={sourceLang}
                  targetLang={targetLang}
                  ageGroup={ageGroup}
                  domainText={domainText}
                  courseInput={courseInput}
                  onCourseInputChange={setCourseInput}
                  generateAudio={generateAudio}
                  generateImages={generateImages}
                  onGenerateAudioChange={setGenerateAudio}
                  onGenerateImagesChange={setGenerateImages}
                  onSourceLangChange={handleSourceLangChange}
                  onTargetLangChange={handleTargetLangChange}
                  onAgeChange={handleAgeChange}
                  onDomainChange={handleDomainChange}
                  onDomainTextChange={setDomainText}
                  loading={loading}
                  courseGenStep={courseGenStep}
                  fetchError={fetchError}
                  keyError={keyError}
                  onGenerate={handleGenerateCourse}
                  onOpenSettings={() => setShowSettings(true)}
                  onClearKeyError={() => setKeyError(null)}
                  onLoad={(course) => {
                    setCourseResult(course as unknown as typeof courseResult);
                    if (course.domain_context) {
                      const domainKey = (DOMAIN_KEYS as readonly string[]).includes(course.domain_context)
                        ? (course.domain_context as DomainKey)
                        : findDomainKey(course.domain_context);
                      if (domainKey) handleDomainChange(domainKey);
                    }
                    if (course.age_group) {
                      const key = (AGE_KEYS as readonly string[]).includes(course.age_group)
                        ? (course.age_group as AgeKey)
                        : findAgeKey(course.age_group);
                      if (key) handleAgeChange(key);
                    }
                    if (course.sourceLang) handleSourceLangChange(course.sourceLang as SupportedLang);
                    if (course.targetLang) handleTargetLangChange(course.targetLang as SupportedLang);
                    setFetchError(null);
                    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
      </div>

      <footer className="border-t border-slate-100 bg-[#F8FAFC]">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
              <img src="/corefirst-logo.svg" alt="CoreFirst" className="w-4 h-4 opacity-50" />
              &copy; {new Date().getFullYear()} CoreFirst. All rights reserved.
            </span>
          <div className="flex items-center gap-4">
            <a
              href="https://corefirst.world"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-600 transition-colors font-medium flex items-center gap-1"
            >
              <Globe className="w-3.5 h-3.5" />
              corefirst.world
            </a>
            <a
              href="https://github.com/corefirst/corefirst"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-600 transition-colors font-medium flex items-center gap-1"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
