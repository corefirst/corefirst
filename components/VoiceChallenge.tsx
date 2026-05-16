"use client";

import React, { useState, useCallback } from 'react';
import { useRecorder } from '@/hooks/useRecorder';
import { useSettings } from '@/hooks/useSettings';
import { Mic, Square, Loader2, Award, Info, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import type { CFLTResponse } from '@/src/types/cflt';
import { t as tr, type SupportedLang } from '@/src/lib/ui-i18n';

interface VoiceChallengeProps {
  expectedText: string;
  sourceLang: string;
  targetLang: string;
  uiLang: SupportedLang;
  sessionId?: string;
  packageSlug?: string | null;
  lessonIndex?: number;
  scriptIndex?: number;
}

interface EvaluationResult {
  score: number;
  pronunciation: number;
  logic_stress: number;
  transcription: string;
  feedback: string;
}

export const VoiceChallenge: React.FC<VoiceChallengeProps> = ({
  expectedText, sourceLang, targetLang, uiLang, sessionId, packageSlug, lessonIndex, scriptIndex
}) => {
  const { isRecording, audioBlob, recorderError, startRecording, stopRecording } = useRecorder();
  const { getHeaders } = useSettings();
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState(false);

  const handleEvaluate = useCallback(async (blob: Blob) => {
    setEvaluating(true);
    setEvalError(null);
    setKeyError(false);
    const formData = new FormData();
    formData.append('audio', blob);
    formData.append('expectedText', expectedText);
    formData.append('sourceLang', sourceLang);
    formData.append('targetLang', targetLang);
    if (sessionId) formData.append('sessionId', sessionId);
    if (packageSlug) formData.append('packageSlug', packageSlug);
    if (lessonIndex !== undefined) formData.append('lessonIndex', lessonIndex.toString());
    if (scriptIndex !== undefined) formData.append('scriptIndex', scriptIndex.toString());

    try {
      const response = await fetch('/api/speech-eval', {
        method: 'POST',
        headers: getHeaders(),
        body: formData,
      });
      if (response.status === 401) { setKeyError(true); return; }
      if (!response.ok) throw new Error('Evaluation failed');
      const data: EvaluationResult = await response.json();
      setEvaluation(data);
    } catch (err) {
      console.error(err);
      setEvalError(tr(uiLang, 'errVoiceEval'));
    } finally {
      setEvaluating(false);
    }
  }, [expectedText, sourceLang, targetLang, sessionId, packageSlug, lessonIndex, scriptIndex, getHeaders]);

  // Auto-evaluate when recording stops and a new blob is ready
  React.useEffect(() => {
    if (audioBlob) {
      setEvaluation(null); // Clear prior result while new evaluation runs
      handleEvaluate(audioBlob);
    }
  }, [audioBlob, handleEvaluate]);

  return (
    <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
          {tr(uiLang, 'voiceChallengeLabel')}
        </span>
        {evaluation && (
          <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
            <Award className="w-3 h-3" />
            {tr(uiLang, 'voiceScore', String(evaluation.score))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            aria-label="Start recording"
            className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg shadow-blue-200 transition-all"
          >
            <Mic className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={stopRecording}
            aria-label="Stop recording"
            className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full animate-pulse transition-all"
          >
            <Square className="w-5 h-5" />
          </button>
        )}

        {evaluating && (
          <div className="flex items-center gap-2 text-slate-500 text-xs font-bold animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin" />
            {tr(uiLang, 'voiceAnalyzing')}
          </div>
        )}

        {!evaluating && !isRecording && !evaluation && !recorderError && !evalError && (
          <p className="text-xs text-slate-400 font-medium">{tr(uiLang, 'voiceChallengeHint')}</p>
        )}
      </div>

      {keyError && (
        <div className="flex items-center gap-2 text-amber-600 text-xs font-bold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {tr(uiLang, 'errNoApiKeyRoleplay')}
        </div>
      )}
      {(recorderError || evalError) && (
        <div className="flex items-center gap-2 text-red-600 text-xs font-bold">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {recorderError ?? evalError}
        </div>
      )}

      {evaluation && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-3"
        >
          <div className="bg-white p-3 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">{tr(uiLang, 'pronunciation')}</p>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-1000"
                style={{ width: `${evaluation.pronunciation}%` }}
              />
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">{tr(uiLang, 'logicStress')}</p>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-1000"
                style={{ width: `${evaluation.logic_stress}%` }}
              />
            </div>
          </div>
          <div className="col-span-2 bg-blue-50 p-3 rounded-xl border border-blue-100 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5" />
            <p className="text-xs text-blue-700 italic leading-relaxed">
              "{evaluation.feedback}"
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
};
