"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { CFLTBlock } from './CFLTBlock';
import { PlayCircle, Loader2, User, Bot, Send, Info, Mic, Square, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRecorder } from '@/hooks/useRecorder';
import { t as tr, type SupportedLang } from '@/src/lib/ui-i18n';

interface Slot { content: string; is_inferred: boolean; }
interface Crst { core: Slot; reason: Slot; space: Slot; time: Slot; }
interface ErrorItem { type: 'spelling' | 'grammar' | 'word_choice' | 'word_order'; original: string; correction: string; note: string; }
interface UserAnalysis { corrected: string; errors: ErrorItem[]; crst: Crst; standard_l1: string; }
interface CoachAnalysis { crst: Crst; standard_l1: string; }

interface Message {
  role: 'user' | 'assistant';
  content: string;
  audioFile?: string;
  correctedAudioFile?: string;
  cflt?: string;
  userAnalysis?: UserAnalysis;
  coachAnalysis?: CoachAnalysis;
  feedback?: string | null;
}

const SLOT_COLORS = {
  core:   { bg: 'bg-cflt-core',   labelKey: 'labelCore' },
  reason: { bg: 'bg-cflt-reason', labelKey: 'labelReason' },
  space:  { bg: 'bg-cflt-space',  labelKey: 'labelSpace' },
  time:   { bg: 'bg-cflt-time',   labelKey: 'labelTime' },
} as const;

const ERROR_LABEL: Record<ErrorItem['type'], string> = {
  spelling: '拼写', grammar: '语法', word_choice: '用词', word_order: '语序',
};

const SLOT_META = {
  core:   { bg: 'bg-cflt-core',   letter: 'C' },
  reason: { bg: 'bg-cflt-reason', letter: 'R' },
  space:  { bg: 'bg-cflt-space',  letter: 'S' },
  time:   { bg: 'bg-cflt-time',   letter: 'T' },
} as const;

// ...

const CrstStrip: React.FC<{ crst: Crst, uiLang: string }> = ({ crst, uiLang }) => (
  <div className="flex flex-wrap gap-2">
    {(['core', 'reason', 'space', 'time'] as const).map((k) => {
      const slot = crst[k];
      const meta = SLOT_META[k];
      if (!slot.content && !slot.is_inferred) return null;
      return (
        <div key={k} className={`text-[11px] font-bold rounded-lg pl-1 pr-2.5 py-1 text-white shadow-sm flex items-center gap-1.5 ${meta.bg} ${slot.is_inferred ? 'ring-2 ring-white/30 ring-inset border border-dashed border-white/50 bg-opacity-90' : 'border border-transparent'}`}>
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

export const CFLTChat = ({ sourceLang, targetLang, packageSlug, packageId, context }: { sourceLang: string, targetLang: string, packageSlug?: string, packageId?: string, context?: string }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: `Hello! I am your Core First coach. Today we are practicing ${targetLang}${context ? ` for ${context}` : ''}.`, cflt: "Hello! I am your coach, for Core First practice, today." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [lastAudioBlob, setLastAudioBlob] = useState<Blob | null>(null);
  const [lastTranscribedText, setLastTranscribedText] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysisEnabled, setAnalysisEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isRecording, audioBlob, recorderError, startRecording, stopRecording, cancelRecording } = useRecorder();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isRecording) cancelRecording(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecording, cancelRecording]);

  useEffect(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') setSessionId(crypto.randomUUID());
    try {
      const stored = window.localStorage.getItem('corefirst.roleplay.analysisEnabled');
      if (stored === 'true') setAnalysisEnabled(true);
    } catch {}
  }, []);

  const toggleAnalysis = (next: boolean) => {
    setAnalysisEnabled(next);
    try { window.localStorage.setItem('corefirst.roleplay.analysisEnabled', next ? 'true' : 'false'); } catch {}
  };

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, loading]);

  useEffect(() => {
    if (!audioBlob) return;
    const transcribeAudio = async () => {
      setTranscribing(true);
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('language', sourceLang);
      try {
        const response = await fetch('/api/transcribe', { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const text = data.text ?? '';
        setInput(text);
        setLastAudioBlob(audioBlob);
        setLastTranscribedText(text);
      } catch (err) { console.error(err); } finally { setTranscribing(false); }
    };
    transcribeAudio();
  }, [audioBlob, sourceLang]);

  useEffect(() => { if (lastTranscribedText !== null && input !== lastTranscribedText) { setLastAudioBlob(null); setLastTranscribedText(null); } }, [input, lastTranscribedText]);

  const playAudio = useCallback(async (text: string, id: string, audioFile?: string) => {
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
        audio.onended = () => { if (url) URL.revokeObjectURL(url); url = null; };
        audio.onerror = () => { if (url) URL.revokeObjectURL(url); url = null; };
      }
      await audio.play();
    } catch (error) { console.error(error); if (url && !audioFile) URL.revokeObjectURL(url); } finally { setAudioLoading(null); }
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    let audioBase64: string | undefined;
    let audioType: string | undefined;
    if (lastAudioBlob) {
      const reader = new FileReader();
      audioBase64 = await new Promise((resolve) => {
        reader.onloadend = () => { const result = reader.result as string; resolve(result.split(',')[1]); };
        reader.readAsDataURL(lastAudioBlob);
      });
      audioType = lastAudioBlob.type;
    }
    const currentAudioBlob = lastAudioBlob;
    setLastAudioBlob(null);
    setLastTranscribedText(null);
    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    const originalInput = input;
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/roleplay', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })), sourceLang, targetLang, analysisEnabled, packageSlug, context, audio: audioBase64 ? { data: audioBase64, type: audioType } : undefined, ...(sessionId ? { sessionId } : {}), }),
      });
      if (!response.ok) throw new Error('Coach unavailable');
      const data: any = await response.json();
      setMessages(prev => {
        const next = [...prev];
        for (let idx = next.length - 1; idx >= 0; idx--) {
          if (next[idx].role === 'user' && next[idx].content === originalInput) {
            next[idx] = { ...next[idx], userAnalysis: data.user_analysis, audioFile: data.audioFile, correctedAudioFile: data.correctedAudioFile };
            break;
          }
        }
        next.push({ role: 'assistant', content: data.reply ?? '(No response)', coachAnalysis: data.coach_analysis, feedback: data.feedback ?? null });
        return next;
      });
    } catch (err) { console.error(err); setMessages(prev => [...prev, { role: 'assistant', content: "Coach error. Try again." }]); } finally { setLoading(false); }
  };

  const uiLang = 'Chinese';

  return (
    <div className="flex flex-col h-[600px] bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
      <div className="p-6 bg-slate-900 text-white flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0"><Bot className="w-6 h-6" /></div>
          <div className="min-w-0">
            <h3 className="font-black text-sm uppercase tracking-widest">Core First Live Coach</h3>
            <p className="text-[10px] text-blue-400 font-bold uppercase truncate">{analysisEnabled ? 'CRST Analysis Mode' : 'Casual Chat Mode'}</p>
          </div>
        </div>
        <button onClick={() => toggleAnalysis(!analysisEnabled)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors flex-shrink-0 ${analysisEnabled ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'}`}><Sparkles className="w-3.5 h-3.5" /><span className="hidden sm:inline">CRST 分析</span></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} items-start gap-3`}>
              {m.role === 'assistant' && (<div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0 flex items-center justify-center"><Bot className="w-4 h-4 text-slate-500" /></div>)}
              <div className="space-y-2 max-w-[80%]">
                <div className={`p-4 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                  <p className="font-bold leading-relaxed text-lg">{m.content}</p>
                  <button onClick={() => playAudio(m.userAnalysis?.corrected || m.content, `msg-${i}`, m.audioFile)} disabled={audioLoading === `msg-${i}`} className={`mt-2 ${m.role === 'user' ? 'text-blue-200 hover:text-white' : 'text-slate-400 hover:text-blue-500'}`}>{audioLoading === `msg-${i}` ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}</button>
                </div>
                {m.role === 'user' && m.userAnalysis && (
                  <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-2 text-left shadow-sm">
                    {m.userAnalysis.corrected && m.userAnalysis.corrected !== m.content && (
                      <div>
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1 flex items-center justify-between">
                          <span>改正</span>
                          <button onClick={() => playAudio(m.userAnalysis!.corrected, `corrected-${i}`, m.correctedAudioFile)} disabled={audioLoading === `corrected-${i}`} title="播放标准纠正发音" className="text-blue-400 hover:text-blue-600 transition-colors">
                            {audioLoading === `corrected-${i}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <p className="text-sm font-bold text-slate-800 leading-snug">{m.userAnalysis.corrected}</p>
                      </div>
                    )}
                    {m.userAnalysis.errors.length > 0 && (
                      <div className="space-y-1">
                        {m.userAnalysis.errors.map((err, k) => (
                          <div key={k} className="text-xs leading-snug text-slate-600">
                            <span className="font-black text-red-500 uppercase mr-1.5">{ERROR_LABEL[err.type] ?? err.type}</span>
                            <span className="line-through text-slate-400">{err.original}</span>
                            <span className="mx-1">→</span>
                            <span className="font-bold text-emerald-600">{err.correction}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div><div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">CRST 分解</div><CrstStrip crst={m.userAnalysis.crst} uiLang={uiLang} /></div>
                  </div>
                )}
                {m.role === 'assistant' && m.coachAnalysis && (
                  <div className="bg-white p-3 rounded-xl border border-slate-100 space-y-2 shadow-sm">
                    <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">CRST 分解</div>
                    <CrstStrip crst={m.coachAnalysis.crst} uiLang={uiLang} />
                  </div>
                )}
                {m.feedback && (
                  <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-amber-700 font-bold leading-tight tracking-tight"><span className="uppercase tracking-widest mr-1.5">教练点评</span>{m.feedback}</p>
                  </div>
                )}
              </div>
              {m.role === 'user' && (<div className="w-8 h-8 rounded-full bg-blue-100 flex-shrink-0 flex items-center justify-center"><User className="w-4 h-4 text-blue-600" /></div>)}
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && <div className="flex justify-start items-center gap-2 text-slate-400 text-xs font-bold animate-pulse"><Loader2 className="w-4 h-4 animate-spin" /> Thinking...</div>}
      </div>

      <div className="p-6 bg-white border-t border-slate-100 space-y-2">
        {recorderError && <p className="text-xs text-red-500 font-medium">{recorderError}</p>}
        <div className="flex gap-3">
          {isRecording ? (<button onClick={stopRecording} className="bg-red-500 text-white p-4 rounded-2xl animate-pulse"><Square className="w-5 h-5" /></button>) : (
            <button onClick={startRecording} disabled={transcribing || loading} className="bg-slate-100 text-slate-600 p-4 rounded-2xl hover:bg-slate-200 disabled:opacity-40 transition-all">{transcribing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}</button>
          )}
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); } }} placeholder={isRecording ? 'Recording...' : transcribing ? 'Transcribing...' : 'Type or speak your response... (⌘/Ctrl+Enter)'} className="flex-1 p-4 rounded-2xl bg-slate-50 border border-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium" />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="bg-slate-900 text-white p-4 rounded-2xl hover:bg-black transition-all disabled:bg-slate-200"><Send className="w-6 h-6" /></button>
        </div>
      </div>
    </div>
  );
};
