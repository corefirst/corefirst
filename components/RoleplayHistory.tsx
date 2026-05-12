"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  PlayCircle,
  Trash2,
  Pencil,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { t as tr, type SupportedLang } from '../src/lib/ui-i18n';

interface Slot { content: string; is_inferred: boolean }
interface Crst { core: Slot; reason: Slot; space: Slot; time: Slot }
interface ErrorItem {
  type: 'spelling' | 'grammar' | 'word_choice' | 'word_order';
  original: string;
  correction: string;
  note: string;
}
interface UserAnalysis {
  corrected: string;
  errors: ErrorItem[];
  crst: Crst;
  standard_l1: string;
}
interface CoachAnalysis {
  crst: Crst;
  standard_l1: string;
}

interface RoleplayMessage {
  eventId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  audioFile?: string;
  correctedAudioFile?: string;
  userAnalysis?: UserAnalysis;
  coachAnalysis?: CoachAnalysis;
  feedback?: string | null;
}

const SLOT_META = {
  core:   { bg: 'bg-cflt-core',   letter: 'C' },
  reason: { bg: 'bg-cflt-reason', letter: 'R' },
  space:  { bg: 'bg-cflt-space',  letter: 'S' },
  time:   { bg: 'bg-cflt-time',   letter: 'T' },
} as const;

const ERROR_LABEL: Record<ErrorItem['type'], string> = {
  spelling: '拼写',
  grammar: '语法',
  word_choice: '用词',
  word_order: '语序',
};

const CrstStrip: React.FC<{ crst: Crst, uiLang: SupportedLang }> = ({ crst, uiLang }) => (
  <div className="flex flex-wrap gap-2">
    {(['core', 'reason', 'space', 'time'] as const).map((k) => {
      const slot = crst[k];
      const meta = SLOT_META[k];
      if (!slot.content && !slot.is_inferred) return null;

      return (
        <div
          key={k}
          className={`text-[11px] font-bold rounded-lg pl-1 pr-2.5 py-1 text-white shadow-sm flex items-center gap-1.5 ${meta.bg} 
            ${slot.is_inferred ? 'ring-2 ring-white/30 ring-inset border border-dashed border-white/50 bg-opacity-90' : 'border border-transparent'}`}
        >
          <span className="w-5 h-5 rounded-md bg-white/20 flex items-center justify-center font-black text-[12px]">{meta.letter}</span>
          <span className="leading-tight">{slot.content || '—'}</span>
          {slot.is_inferred && (
            <Sparkles className="w-2.5 h-2.5 opacity-80" />
          )}
        </div>
      );
    })}
  </div>
);

interface RoleplaySessionItem {
  sessionId: string;
  context: string;
  sourceLang: string;
  targetLang: string;
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
  messages: RoleplayMessage[];
  packageSlug: string;
}

interface HistoryPayload {
  roleplaySessions: RoleplaySessionItem[];
}

const formatTimestamp = (iso: string, lang: SupportedLang) => {
  const locale = ({ English: 'en', Chinese: 'zh-CN', Japanese: 'ja', Korean: 'ko', Vietnamese: 'vi', Spanish: 'es', French: 'fr', German: 'de' } as const)[lang] ?? 'en';
  try { return new Date(iso).toLocaleString(locale, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
};

interface Props { uiLang: SupportedLang }

export const RoleplayHistory = ({ uiLang }: Props) => {
  const [sessions, setSessions] = useState<RoleplaySessionItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const [deletingMessage, setDeletingMessage] = useState<string | null>(null);
  const [retranscribing, setRetranscribing] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const deleteSession = async (s: RoleplaySessionItem) => {
    if (!window.confirm(tr(uiLang, 'confirmDeleteRoleplaySession'))) return;
    setDeletingSession(s.sessionId);
    try {
      const qs = s.packageSlug && s.packageSlug !== 'global' ? `?slug=${encodeURIComponent(s.packageSlug)}` : '';
      const res = await fetch(`/api/history/roleplay/sessions/${encodeURIComponent(s.sessionId)}${qs}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete session failed');
      setSessions((prev) => (prev ?? []).filter((x) => x.sessionId !== s.sessionId));
    } catch (err) {
      console.error('[RoleplayHistory] delete session error:', err);
    } finally {
      setDeletingSession(null);
    }
  };

  const deleteMessage = async (sessionId: string, eventId: string) => {
    if (!eventId) return;
    if (!window.confirm(tr(uiLang, 'confirmDeleteRoleplayMessage'))) return;
    setDeletingMessage(eventId);
    try {
      const res = await fetch(`/api/history/roleplay/messages/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('delete msg failed');
      setSessions((prev) =>
        (prev ?? []).map((s) =>
          s.sessionId === sessionId
            ? {
                ...s,
                messages: s.messages.filter((m) => m.eventId !== eventId),
                messageCount: Math.max(0, s.messageCount - 1),
              }
            : s,
        ),
      );
    } catch (err) {
      console.error('[RoleplayHistory] delete message error:', err);
    } finally {
      setDeletingMessage(null);
    }
  };

  const retranscribe = async (sessionId: string, msg: RoleplayMessage, sourceLang: string) => {
    if (!msg.audioFile || !msg.eventId) return;
    setRetranscribing(msg.eventId);
    try {
      const audioRes = await fetch(`/api/media/${msg.audioFile}`);
      if (!audioRes.ok) throw new Error('audio fetch failed');
      const blob = await audioRes.blob();
      const formData = new FormData();
      formData.append('audio', blob);
      formData.append('language', sourceLang);
      const transcribeRes = await fetch('/api/transcribe', { method: 'POST', body: formData });
      if (!transcribeRes.ok) throw new Error('transcribe failed');
      const { text } = await transcribeRes.json();
      if (!text) return;
      await fetch(`/api/history/roleplay/messages/${encodeURIComponent(msg.eventId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      setSessions((prev) =>
        (prev ?? []).map((s) =>
          s.sessionId === sessionId
            ? { ...s, messages: s.messages.map((m) => m.eventId === msg.eventId ? { ...m, content: text } : m) }
            : s,
        ),
      );
    } catch (err) {
      console.error('[RoleplayHistory] retranscribe error:', err);
    } finally {
      setRetranscribing(null);
    }
  };

  const startRename = (s: RoleplaySessionItem) => {
    setRenaming(s.sessionId);
    setRenameValue(s.context);
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue('');
  };

  const saveRename = async (s: RoleplaySessionItem) => {
    const next = renameValue.trim();
    if (!next || next === s.context) return cancelRename();
    try {
      const qs = s.packageSlug && s.packageSlug !== 'global' ? `?slug=${encodeURIComponent(s.packageSlug)}` : '';
      const res = await fetch(`/api/history/roleplay/sessions/${encodeURIComponent(s.sessionId)}${qs}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: next }),
      });
      if (!res.ok) throw new Error('rename failed');
      setSessions((prev) =>
        (prev ?? []).map((x) => (x.sessionId === s.sessionId ? { ...x, context: next } : x)),
      );
    } catch (err) {
      console.error('[RoleplayHistory] rename error:', err);
    } finally {
      cancelRename();
    }
  };

  const playAudio = useCallback(async (text: string, id: string, audioFile?: string) => {
    if (!text.trim() && !audioFile) return;
    setAudioLoading(id);
    let url: string | null = null;
    try {
      if (audioFile) url = `/api/media/${audioFile}`;
      else {
        const response = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
        if (!response.ok) throw new Error('TTS failed');
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
      }
      const audio = new Audio(url);
      if (!audioFile) {
        audio.onended = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
        audio.onerror = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
      }
      await audio.play();
    } catch (err) { console.error(err); if (url && !audioFile) URL.revokeObjectURL(url); } finally { setAudioLoading(null); }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/history/roleplay');
        if (!res.ok) throw new Error('Failed');
        const payload: HistoryPayload = await res.json();
        if (!cancelled) setSessions(payload.roleplaySessions);
      } catch (err) { if (!cancelled) setHasError(true); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => { setExpanded((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };

  if (loading) return <div className="flex items-center justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-500" /></div>;
  if (hasError) return <div className="bg-white p-8 rounded-3xl shadow-sm text-center space-y-3"><AlertCircle className="w-8 h-8 text-red-400 mx-auto" /><p className="text-slate-500 text-sm">{tr(uiLang, 'historyError')}</p></div>;

  const list = sessions ?? [];
  if (list.length === 0) return <div className="bg-white p-8 rounded-3xl shadow-sm text-center space-y-3"><Clock className="w-8 h-8 text-slate-300 mx-auto" /><p className="text-slate-400 text-sm">{tr(uiLang, 'historyEmpty')}</p></div>;

  return (
    <section className="bg-white p-8 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-white space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600"><MessageSquare className="w-5 h-5" /></div>
        <h2 className="text-xl font-black text-slate-800">{tr(uiLang, 'historyRoleplayHeader')}</h2>
        <span className="text-xs font-bold text-slate-400">({list.length})</span>
      </div>
      <ul className="space-y-3">
        {list.map((session) => {
          const isOpen = expanded.has(session.sessionId);
          return (
            <li key={session.sessionId} className="border border-slate-100 rounded-2xl overflow-hidden hover:border-emerald-200 transition-all">
              <div className="relative">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(session.sessionId)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(session.sessionId); }}
                  className="w-full p-5 pr-24 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center justify-between mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <span>{session.sourceLang} → {session.targetLang}</span>
                    <span>{formatTimestamp(session.lastMessageAt, uiLang)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{tr(uiLang, 'historyContextLabel')}</p>
                      {renaming === session.sessionId ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            autoFocus
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename(session);
                              if (e.key === 'Escape') cancelRename();
                            }}
                            className="flex-1 px-2 py-1 text-sm font-medium text-slate-700 border border-emerald-300 rounded focus:outline-none focus:ring-2 focus:ring-emerald-200"
                          />
                          <button onClick={(e) => { e.stopPropagation(); saveRename(session); }} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); cancelRename(); }} className="p-1 text-slate-400 hover:bg-slate-50 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-slate-700 font-medium truncate">{session.context}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg">{tr(uiLang, 'historyMessageCount', String(session.messageCount))}</span>
                      {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>
                </div>
                {renaming !== session.sessionId && (
                  <div className="absolute top-3 right-12 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); startRename(session); }}
                      aria-label={tr(uiLang, 'rename')}
                      title={tr(uiLang, 'rename')}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteSession(session); }}
                      disabled={deletingSession === session.sessionId}
                      aria-label={tr(uiLang, 'delete')}
                      title={tr(uiLang, 'delete')}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deletingSession === session.sessionId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="px-5 pb-5 pt-1 space-y-2 border-t border-slate-100">
                      {session.messages.map((m, mi) => {
                        const audioId = `${session.sessionId}-${mi}`;
                        const isPlaying = audioLoading === audioId;
                        return (
                          <div key={audioId} className={`p-3 rounded-xl space-y-2 ${m.role === 'user' ? 'bg-blue-50 text-blue-900' : 'bg-slate-50 text-slate-800'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[10px] font-black uppercase tracking-widest opacity-60">{m.role}</div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => playAudio(m.userAnalysis?.corrected || m.content, audioId, m.audioFile)} disabled={isPlaying} className={`transition-colors ${m.role === 'user' ? 'text-blue-400 hover:text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}>{isPlaying ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}</button>
                                {m.role === 'user' && m.audioFile && m.eventId && (
                                  <button
                                    onClick={() => retranscribe(session.sessionId, m, session.sourceLang)}
                                    disabled={retranscribing === m.eventId}
                                    aria-label="重新识别"
                                    title="重新识别录音文字"
                                    className="text-slate-300 hover:text-blue-500 transition-colors disabled:opacity-50"
                                  >
                                    {retranscribing === m.eventId ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                  </button>
                                )}
                                {m.eventId && (
                                  <button
                                    onClick={() => deleteMessage(session.sessionId, m.eventId)}
                                    disabled={deletingMessage === m.eventId}
                                    aria-label={tr(uiLang, 'delete')}
                                    title={tr(uiLang, 'delete')}
                                    className="text-slate-300 hover:text-red-600 transition-colors disabled:opacity-50"
                                  >
                                    {deletingMessage === m.eventId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="whitespace-pre-wrap leading-relaxed text-base font-medium">{m.content}</div>
                            {m.role === 'user' && m.userAnalysis && (
                              <div className="bg-white/70 rounded-lg p-2.5 space-y-2 border border-blue-100">
                                {m.userAnalysis.corrected && m.userAnalysis.corrected !== m.content && (
                                  <div><span className="text-[10px] font-black uppercase text-slate-400 tracking-widest mr-1.5 align-middle">改正</span><span className="font-bold">{m.userAnalysis.corrected}</span>
                                    <button onClick={() => playAudio(m.userAnalysis!.corrected, `corrected-${audioId}`, m.correctedAudioFile)} className="ml-2 text-blue-400 hover:text-blue-600 align-middle"><PlayCircle className="w-3.5 h-3.5" /></button>
                                  </div>
                                )}
                                {m.userAnalysis.errors.length > 0 && (
                                  <div className="space-y-1">
                                    {m.userAnalysis.errors.map((err, k) => (
                                      <div key={k} className="text-xs leading-snug"><span className="font-black text-red-500 uppercase mr-1">{ERROR_LABEL[err.type] ?? err.type}</span><span className="line-through text-slate-400">{err.original}</span><span className="mx-1">→</span><span className="font-bold text-emerald-600">{err.correction}</span>{err.note && <span className="ml-1 text-slate-500 italic">— {err.note}</span>}</div>
                                    ))}
                                  </div>
                                )}
                                <div className="pt-1"><div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Core / Reason / Space / Time 分解</div><CrstStrip crst={m.userAnalysis.crst} uiLang={uiLang} /></div>
                              </div>
                            )}
                            {m.role === 'assistant' && m.coachAnalysis && (
                              <div className="bg-white/70 rounded-lg p-2.5 space-y-2 border border-slate-100">
                                <div><div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Core / Reason / Space / Time 分解</div><CrstStrip crst={m.coachAnalysis.crst} uiLang={uiLang} /></div>
                              </div>
                            )}
                            {m.role === 'assistant' && m.feedback && (<div className="bg-amber-50 rounded-lg p-2 text-xs leading-snug text-amber-700 font-bold"><span className="text-[10px] uppercase tracking-widest mr-1.5">教练点评</span>{m.feedback}</div>)}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
