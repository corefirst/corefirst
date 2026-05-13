"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, BookOpen, Clock, FolderOpen, Trash2, Pencil, Check, X, Download, Upload } from 'lucide-react';
import { t as tr, type SupportedLang } from '../src/lib/ui-i18n';
import type { CoursewareManifest } from '../src/types/courseware';

interface CourseSummary {
  slug: string;
  packageId: string;
  topic: string;
  ageGroup: string;
  industry: string;
  sourceLang: string;
  targetLang: string;
  createdAt: string;
  lessonCount: number;
  scriptCount: number;
}

interface HistoryPayload {
  courses: CourseSummary[];
}

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

interface Props {
  uiLang: SupportedLang;
  refreshKey?: number;
  /** Called when the user picks a past course to render. The parent should
   *  set this as the live courseResult so the existing course UI takes over. */
  onLoad: (course: CoursewareManifest & { packageId?: string; packageSlug?: string }) => void;
  /** Called after a successful import so the parent can refresh the list. */
  onImport?: () => void;
}

export const CourseHistory = ({ uiLang, refreshKey = 0, onLoad, onImport }: Props) => {
  const [items, setItems] = useState<CourseSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [exportingSlug, setExportingSlug] = useState<string | null>(null);
  const [renamingSlug, setRenamingSlug] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleDelete = async (slug: string) => {
    if (!window.confirm(tr(uiLang, 'confirmDeleteCourse'))) return;
    setDeletingSlug(slug);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      setItems((prev) => (prev ?? []).filter((c) => c.slug !== slug));
    } catch (err) {
      console.error('[CourseHistory] delete error:', err);
    } finally {
      setDeletingSlug(null);
    }
  };

  const startRename = (course: CourseSummary) => {
    setRenamingSlug(course.slug);
    setRenameValue(course.topic);
  };

  const cancelRename = () => {
    setRenamingSlug(null);
    setRenameValue('');
  };

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
      console.error('[CourseHistory] rename error:', err);
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
      a.href = url;
      a.download = `${slug}.corefirst`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[CourseHistory] export error:', err);
    } finally {
      setExportingSlug(null);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/courses/import', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'import failed');
      }
      onImport?.();
    } catch (err) {
      console.error('[CourseHistory] import error:', err);
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setHasError(false);
    (async () => {
      try {
        const res = await fetch('/api/history/courses');
        if (!res.ok) throw new Error('Failed to load course history');
        const payload: HistoryPayload = await res.json();
        if (!cancelled) setItems(payload.courses);
      } catch (err) {
        console.error('[CourseHistory] Error:', err);
        if (!cancelled) setHasError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleLoad = async (slug: string) => {
    setLoadingSlug(slug);
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error('Failed to load course');
      const data = await res.json();
      onLoad(data);
    } catch (err) {
      console.error('[CourseHistory] handleLoad error:', err);
    } finally {
      setLoadingSlug(null);
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

  return (
    <section className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-white space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-amber-100 p-2 rounded-xl text-amber-600">
          <BookOpen className="w-5 h-5" />
        </div>
        <h2 className="text-xl font-black text-slate-800">{tr(uiLang, 'historyCoursesHeader')}</h2>
        <span className="text-xs font-bold text-slate-400">({list.length})</span>
        <div className="ml-auto">
          <input
            ref={importInputRef}
            type="file"
            accept=".corefirst"
            className="hidden"
            onChange={handleImport}
          />
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-50 transition-colors"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Import
          </button>
        </div>
      </div>

      <ul className="space-y-3">
        {list.map((course) => {
          const isLoading = loadingSlug === course.slug;
          const isDeleting = deletingSlug === course.slug;
          const isRenaming = renamingSlug === course.slug;
          return (
            <li
              key={course.slug}
              className="border border-slate-100 rounded-2xl p-5 hover:border-amber-200 hover:shadow-md hover:shadow-amber-50 transition-all"
            >
              <div className="flex items-center justify-between gap-3 mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <span>{course.sourceLang} → {course.targetLang}</span>
                <span>{formatTimestamp(course.createdAt, uiLang)}</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                    {tr(uiLang, 'historyTopicLabel')}
                  </p>
                  {isRenaming ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(course.slug, course.topic);
                          if (e.key === 'Escape') cancelRename();
                        }}
                        className="flex-1 px-2 py-1 text-base font-bold text-slate-900 border border-amber-300 rounded focus:outline-none focus:ring-2 focus:ring-amber-200"
                      />
                      <button onClick={() => saveRename(course.slug, course.topic)} className="p-1 text-amber-600 hover:bg-amber-50 rounded">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={cancelRename} className="p-1 text-slate-400 hover:bg-slate-50 rounded">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-slate-900 font-black truncate">{course.topic}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1 truncate">
                    {course.industry} · {course.ageGroup}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2">
                    {tr(uiLang, 'historyLessonCount', String(course.lessonCount))}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startRename(course)}
                    aria-label={tr(uiLang, 'rename')}
                    title={tr(uiLang, 'rename')}
                    className="p-2 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExport(course.slug)}
                    disabled={exportingSlug === course.slug}
                    aria-label="Export course"
                    title="Export .corefirst"
                    className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    {exportingSlug === course.slug
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Download className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(course.slug)}
                    disabled={isDeleting}
                    aria-label={tr(uiLang, 'delete')}
                    title={tr(uiLang, 'delete')}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoad(course.slug)}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-black uppercase tracking-wider transition-colors"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FolderOpen className="w-4 h-4" />
                    )}
                    {tr(uiLang, 'historyLoadCourse')}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
