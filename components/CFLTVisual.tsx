"use client";

import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CFLTVisualProps {
  prompt: string;
  /** Optional pre-rendered image URL (e.g. /api/courses/:slug/image/:lesson).
   *  When present, used directly — skips the image-generation round trip. */
  imageUrl?: string;
}

export const CFLTVisual: React.FC<CFLTVisualProps> = ({ prompt, imageUrl }) => {
  const [url, setUrl] = useState<string | null>(imageUrl ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    // Fast path: parent provided a stored asset URL — use it as-is.
    if (imageUrl) {
      setUrl(imageUrl);
      setLoading(false);
      setError(false);
      return;
    }
    if (!prompt) return;

    const controller = new AbortController();
    let cancelled = false;

    const fetchImage = async () => {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Image generation failed');
        const data = await response.json();
        if (!cancelled) {
          if (data.url) setUrl(data.url);
          else setError(true);
        }
      } catch (err) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchImage();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [prompt, imageUrl]);

  return (
    <div className="relative w-full aspect-video rounded-3xl overflow-hidden bg-slate-100 border border-slate-200 group">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center space-y-3"
          >
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest animate-pulse">
              AI is painting the scenario...
            </p>
          </motion.div>
        ) : url ? (
          <motion.img
            key="image"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            src={url}
            alt={prompt}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300">
            <ImageIcon className="w-16 h-16 mb-2 opacity-20" />
            <p className="text-xs font-bold">{error ? "Failed to load image" : "No image generated"}</p>
          </div>
        )}
      </AnimatePresence>

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

      {/* Prompt Badge */}
      <div className="absolute bottom-4 left-6 right-6">
        <p className="text-[10px] text-white/80 font-medium line-clamp-1 italic bg-black/20 backdrop-blur-sm p-2 rounded-lg inline-block">
          Concept: {prompt}
        </p>
      </div>
    </div>
  );
};
