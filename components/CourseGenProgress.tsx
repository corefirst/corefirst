"use client";

import React from 'react';
import { Check, Loader2, AlertCircle, Circle, X as XIcon } from 'lucide-react';
import { t as tr } from '../src/lib/ui-i18n';

export type AssetStatus = 'waiting' | 'generating' | 'done' | 'failed' | 'skipped';

export interface ChapterProgress {
  lessonIndex: number;
  title: string;
  textStatus: AssetStatus;
  imageStatus: AssetStatus;
  audioStatus: AssetStatus;
}

export interface CourseGenProgressState {
  lessons: ChapterProgress[];
  /** Plain-text step label for the generation phase (e.g. "Designing lessons…"). */
  step: string | null;
  /** Stable error code from the server. Currently INSUFFICIENT_CREDITS is the
   *  only one with bespoke UX; other codes show the generic error message. */
  errorCode?: 'INSUFFICIENT_CREDITS' | 'API_KEY_REQUIRED' | 'INVALID_API_KEY' | null;
  errorMessage?: string | null;
}

// Inline translations — only English + Chinese, since the rest of the UI
// falls back to English for unknown languages anyway. Kept here (instead of
// in ui-i18n.ts) so the chapter-progress feature is a single self-contained
// drop-in.
type LabelDict = Record<string, string | ((m: number, n: number) => string)>;
const LABELS: Record<string, LabelDict> = {
  English: {
    title: 'Generating course…',
    text: 'Text',
    image: 'Image',
    audio: 'Audio',
    waiting: 'Waiting',
    generating: 'Generating…',
    done: 'Done',
    failed: 'Failed',
    skipped: 'Skipped',
    continueLater: 'Continue (after top-up)',
    progressLine: (m: number, n: number) => `${m}/${n} chapters with text complete`,
  },
  Chinese: {
    title: '课程生成中…',
    text: '文字',
    image: '配图',
    audio: '音频',
    waiting: '等待中',
    generating: '生成中…',
    done: '已完成',
    failed: '失败',
    skipped: '已跳过',
    continueLater: '继续生成（充值后）',
    progressLine: (m: number, n: number) => `已完成 ${m}/${n} 章的文字内容`,
  },
};

function l(uiLang: string, key: string): string {
  const dict = LABELS[uiLang] ?? LABELS.English;
  const v = dict[key] ?? LABELS.English[key];
  return typeof v === 'string' ? v : '';
}

function progressText(uiLang: string, m: number, n: number): string {
  const dict = LABELS[uiLang] ?? LABELS.English;
  const fn = dict.progressLine ?? LABELS.English.progressLine;
  return typeof fn === 'function' ? fn(m, n) : '';
}

function statusBadge(status: AssetStatus, uiLang: string): React.ReactElement {
  // Compact icon + label; small enough to sit inside a chapter row without
  // wrapping. We always render in the same width so the chapter list aligns.
  const base = 'inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider';
  switch (status) {
    case 'done':
      return <span className={`${base} text-emerald-600`}><Check className="w-3 h-3" />{l(uiLang, 'done')}</span>;
    case 'generating':
      return <span className={`${base} text-amber-600`}><Loader2 className="w-3 h-3 animate-spin" />{l(uiLang, 'generating')}</span>;
    case 'failed':
      return <span className={`${base} text-rose-600`}><AlertCircle className="w-3 h-3" />{l(uiLang, 'failed')}</span>;
    case 'skipped':
      return <span className={`${base} text-slate-400`}><XIcon className="w-3 h-3" />{l(uiLang, 'skipped')}</span>;
    case 'waiting':
    default:
      return <span className={`${base} text-slate-300`}><Circle className="w-3 h-3" />{l(uiLang, 'waiting')}</span>;
  }
}

export interface CourseGenProgressProps {
  uiLang: string;
  state: CourseGenProgressState;
}

export const CourseGenProgress: React.FC<CourseGenProgressProps> = ({ uiLang, state }) => {
  const { lessons, step, errorCode, errorMessage } = state;
  if (lessons.length === 0 && !step && !errorCode) return null;

  const textDone = lessons.filter((c) => c.textStatus === 'done').length;
  const insufficient = errorCode === 'INSUFFICIENT_CREDITS';

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-wider text-slate-700">
          {l(uiLang, 'title')}
        </p>
        {step && !insufficient && (
          <span className="text-xs font-medium text-slate-500">{step}</span>
        )}
      </div>

      {lessons.length > 0 && (
        <ul className="space-y-2">
          {lessons.map((c) => (
            <li
              key={c.lessonIndex}
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded-xl bg-white px-3 py-2 border border-slate-100"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-500">
                  {String(c.lessonIndex + 1).padStart(2, '0')}
                </p>
                <p className="text-sm font-medium text-slate-800 truncate">{c.title}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">{l(uiLang, 'text')}</span>
                  {statusBadge(c.textStatus, uiLang)}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">{l(uiLang, 'image')}</span>
                  {statusBadge(c.imageStatus, uiLang)}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase text-slate-400">{l(uiLang, 'audio')}</span>
                  {statusBadge(c.audioStatus, uiLang)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {lessons.length > 0 && (
        <p className="text-[11px] font-medium text-slate-500">
          {progressText(uiLang, textDone, lessons.length)}
        </p>
      )}

      {insufficient && (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{tr(uiLang, 'errInsufficientCredits')}</span>
        </div>
      )}

      {errorMessage && !insufficient && (
        <p className="text-sm text-rose-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errorMessage}
        </p>
      )}
    </div>
  );
};

// Pure-functional reducer over SSE events from the generate-course endpoint.
// Kept here so the SSE handler in page.tsx stays a single switch — the state
// shape and the events that drive it live together.
export function reduceCourseGenEvent(
  state: CourseGenProgressState,
  event: Record<string, unknown>,
): CourseGenProgressState {
  const type = event.type as string | undefined;
  switch (type) {
    case 'step':
      return { ...state, step: (event.message as string) ?? state.step };

    case 'outline': {
      const raw = (event.lessons as Array<{ lessonIndex: number; title: string }>) ?? [];
      return {
        ...state,
        step: (event.message as string) ?? state.step,
        lessons: raw.map((l) => ({
          lessonIndex: l.lessonIndex,
          title: l.title,
          textStatus: 'generating',
          imageStatus: 'waiting',
          audioStatus: 'waiting',
        })),
      };
    }

    case 'lesson-text': {
      const idx = event.lessonIndex as number;
      const status = event.status as AssetStatus;
      return updateLesson(state, idx, (c) => ({ ...c, textStatus: status }));
    }

    case 'lesson-image': {
      const idx = event.lessonIndex as number;
      const status = event.status as AssetStatus;
      const code = event.code as CourseGenProgressState['errorCode'] | undefined;
      const next = updateLesson(state, idx, (c) => ({ ...c, imageStatus: status }));
      if (status === 'failed' && code === 'INSUFFICIENT_CREDITS') {
        return { ...next, errorCode: 'INSUFFICIENT_CREDITS' };
      }
      return next;
    }

    case 'lesson-audio': {
      const idx = event.lessonIndex as number;
      const status = event.status as AssetStatus;
      const code = event.code as CourseGenProgressState['errorCode'] | undefined;
      const next = updateLesson(state, idx, (c) => {
        // A lesson has multiple scripts. The chapter row collapses them: once
        // every script is done, the chapter audio is done. If any failed, we
        // surface failed. While any is generating, show generating.
        const incoming = status;
        const prev = c.audioStatus;
        if (incoming === 'failed' || prev === 'failed') return { ...c, audioStatus: 'failed' };
        if (incoming === 'generating' || prev === 'generating') return { ...c, audioStatus: 'generating' };
        if (incoming === 'skipped' && prev !== 'done') return { ...c, audioStatus: 'skipped' };
        return { ...c, audioStatus: incoming };
      });
      if (status === 'failed' && code === 'INSUFFICIENT_CREDITS') {
        return { ...next, errorCode: 'INSUFFICIENT_CREDITS' };
      }
      return next;
    }

    case 'error': {
      return {
        ...state,
        errorCode: (event.code as CourseGenProgressState['errorCode']) ?? null,
        errorMessage: (event.message as string) ?? 'Course generation failed',
      };
    }

    case 'complete': {
      const exhausted = (event.creditsExhausted as boolean) === true;
      return {
        ...state,
        step: null,
        errorCode: exhausted ? 'INSUFFICIENT_CREDITS' : state.errorCode,
      };
    }

    default:
      return state;
  }
}

function updateLesson(
  state: CourseGenProgressState,
  lessonIndex: number,
  patch: (c: ChapterProgress) => ChapterProgress,
): CourseGenProgressState {
  let touched = false;
  const next = state.lessons.map((c) => {
    if (c.lessonIndex !== lessonIndex) return c;
    touched = true;
    return patch(c);
  });
  return touched ? { ...state, lessons: next } : state;
}

export const initialCourseGenProgress: CourseGenProgressState = {
  lessons: [],
  step: null,
  errorCode: null,
  errorMessage: null,
};
