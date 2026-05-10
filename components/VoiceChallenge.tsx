"use client";

import React, { useState } from 'react';
import { useRecorder } from '@/hooks/useRecorder';
import { Mic, Square, Loader2, Award, Info, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import type { CFLTResponse } from '@/src/types/cflt';

interface VoiceChallengeProps {
  expectedText: string;
  sourceLang: string;
  targetLang: string;
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
  expectedText, sourceLang, targetLang, sessionId, packageSlug, lessonIndex, scriptIndex
}) => {
  const { isRecording, audioBlob, recorderError, startRecording, stopRecording } = useRecorder();
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  const handleEvaluate = async (blob: Blob) => {
    setEvaluating(true);
    setEvalError(null);
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
        body: formData,
      });
      if (!response.ok) throw new Error('Evaluation failed');
      const data: EvaluationResult = await response.json();
      setEvaluation(data);
    } catch (err) {
      console.error(err);
      setEvalError('Could not evaluate speech. Please try again.');
    } finally {
      setEvaluating(false);
    }
  };

  // Auto-evaluate when recording stops and a new blob is ready
  React.useEffect(() => {
    if (audioBlob) {
      setEvaluation(null); // Clear prior result while new evaluation runs
      handleEvaluate(audioBlob);
    }
  }, [audioBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
          Voice Challenge
        </span>
        {evaluation && (
          <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold">
            <Award className="w-3 h-3" />
            Score: {evaluation.score}
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
            Analyzing your logic stress...
          </div>
        )}

        {!evaluating && !isRecording && !evaluation && !recorderError && !evalError && (
          <p className="text-xs text-slate-400 font-medium">Click to record and practice your Core First prosody.</p>
        )}
      </div>

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
            <p className="text-[10px] font-bold text-slate-400 uppercase">Pronunciation</p>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-1000"
                style={{ width: `${evaluation.pronunciation}%` }}
              />
            </div>
          </div>
          <div className="bg-white p-3 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase">Logic Stress</p>
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
