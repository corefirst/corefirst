import { useState, useRef, useCallback, useEffect } from 'react';

export const useRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recorderError, setRecorderError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop recording and release the mic when the component unmounts
  useEffect(() => {
    return () => {
      try { mediaRecorderRef.current?.stop(); } catch {}
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const startRecording = useCallback(async () => {
    setRecorderError(null);
    setAudioBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Only set audioBlob if we are NOT cancelling
        if (mediaRecorderRef.current?.state !== 'inactive') {
            // This is actually handled by the flag inside onstop's closure below
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied or not available';
      console.error('[useRecorder] Error:', err);
      setRecorderError(msg);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      // Set the onstop handler to actually process the data
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      // Override onstop handler to do nothing except cleanup
      mediaRecorderRef.current.onstop = () => {
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setAudioBlob(null);
    }
  }, [isRecording]);

  return {
    isRecording,
    audioBlob,
    recorderError,
    startRecording,
    stopRecording,
    cancelRecording,
  };
};
