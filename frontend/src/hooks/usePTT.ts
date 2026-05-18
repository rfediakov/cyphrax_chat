import { useState, useRef, useCallback, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { PTTAudioQueue } from '../lib/pttAudioQueue';
import { vibrateShort } from '../lib/vibration';
import { useNetworkStore } from '../store/network.store';

export interface ActiveSpeaker {
  userId: string;
  sessionId: string;
}

export interface UsePTTResult {
  isTransmitting: boolean;
  isReceiving: boolean;
  activeSpeaker: ActiveSpeaker | null;
  startTransmitting: (roomId: string) => Promise<void>;
  stopTransmitting: () => void;
  /** Set to true when another user is already transmitting (PTT locked). */
  isBusy: boolean;
}

// Preferred codec — Opus in WebM container; fallback to plain webm
const PREFERRED_MIME = 'audio/webm;codecs=opus';
const FALLBACK_MIME = 'audio/webm';

function getSupportedMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (MediaRecorder.isTypeSupported(PREFERRED_MIME)) return PREFERRED_MIME;
  if (MediaRecorder.isTypeSupported(FALLBACK_MIME)) return FALLBACK_MIME;
  return null;
}

export function usePTT(socket: Socket | null, roomId: string | null): UsePTTResult {
  const isOnline = useNetworkStore((s) => s.isOnline);

  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<ActiveSpeaker | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionIdRef = useRef<string>('');
  const activeRoomRef = useRef<string | null>(null);
  const audioQueueRef = useRef<PTTAudioQueue>(new PTTAudioQueue());

  const stopTransmitting = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;

    if (socket && activeRoomRef.current && sessionIdRef.current) {
      socket.emit('ptt_end', { roomId: activeRoomRef.current, sessionId: sessionIdRef.current });
    }

    setIsTransmitting(false);
    vibrateShort();
  }, [socket]);

  const startTransmitting = useCallback(async (targetRoomId: string) => {
    if (!socket || !isOnline) return;
    if (isBusy) return;

    const mimeType = getSupportedMime();
    if (!mimeType) {
      console.warn('[PTT] MediaRecorder not supported in this browser');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.warn('[PTT] Microphone permission denied:', err);
      return;
    }

    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionIdRef.current = sessionId;
    activeRoomRef.current = targetRoomId;
    streamRef.current = stream;

    socket.emit('ptt_start', { roomId: targetRoomId, sessionId });
    vibrateShort();
    setIsTransmitting(true);

    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 16_000 });
    recorderRef.current = recorder;

    recorder.addEventListener('dataavailable', (e: BlobEvent) => {
      if (e.data.size === 0) return;
      e.data.arrayBuffer().then((buf) => {
        socket.emit('ptt_chunk', { roomId: targetRoomId, sessionId, chunk: buf });
      }).catch(() => {});
    });

    recorder.addEventListener('stop', () => {
      setIsTransmitting(false);
    });

    // Emit chunk every 250 ms for low-latency streaming
    recorder.start(250);
  }, [socket, isOnline, isBusy]);

  // Listen for incoming PTT events
  useEffect(() => {
    if (!socket) return;

    const onPttStart = ({ userId, sessionId, roomId: eventRoomId }: { userId: string; sessionId: string; roomId: string }) => {
      if (roomId && eventRoomId !== roomId) return;
      setActiveSpeaker({ userId, sessionId });
      setIsReceiving(true);
      setIsBusy(true);
    };

    const onPttChunk = ({ chunk }: { sessionId: string; senderId: string; chunk: ArrayBuffer }) => {
      void audioQueueRef.current.enqueue(chunk);
    };

    const onPttEnd = ({ roomId: eventRoomId }: { roomId: string; userId: string; sessionId: string }) => {
      if (roomId && eventRoomId !== roomId) return;
      setActiveSpeaker(null);
      setIsReceiving(false);
      setIsBusy(false);
      audioQueueRef.current.flush();
    };

    const onPttBusy = ({ roomId: eventRoomId, userId }: { roomId: string; userId: string }) => {
      if (roomId && eventRoomId !== roomId) return;
      setIsBusy(true);
      // If we're trying to transmit, indicate room is locked
      console.warn(`[PTT] Room locked by userId=${userId}`);
    };

    socket.on('ptt_start', onPttStart);
    socket.on('ptt_chunk', onPttChunk);
    socket.on('ptt_end', onPttEnd);
    socket.on('ptt_busy', onPttBusy);

    return () => {
      socket.off('ptt_start', onPttStart);
      socket.off('ptt_chunk', onPttChunk);
      socket.off('ptt_end', onPttEnd);
      socket.off('ptt_busy', onPttBusy);
    };
  }, [socket, roomId]);

  // Cleanup on unmount
  useEffect(() => {
    const queue = audioQueueRef.current;
    return () => {
      if (recorderRef.current?.state !== 'inactive') {
        recorderRef.current?.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      queue.destroy();
    };
  }, []);

  return { isTransmitting, isReceiving, activeSpeaker, startTransmitting, stopTransmitting, isBusy };
}
