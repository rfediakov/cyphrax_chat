/**
 * Preferred audio MIME types in priority order.
 * Falls back to the browser's default if none are supported.
 */
const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

function pickMimeType(candidates: string[]): string {
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return '';
}

export interface AudioRecordingResult {
  blob: Blob;
  duration: number;
  mimeType: string;
}

export interface VideoRecordingResult {
  blob: Blob;
  thumbnail: Blob;
  duration: number;
  mimeType: string;
}

/**
 * Records audio until `stop()` is called or `maxSeconds` elapses.
 * Returns a controller object with a `stop()` method and a `result` promise.
 */
export function startAudioRecording(maxSeconds = 60): {
  stop: () => void;
  cancel: () => void;
  result: Promise<AudioRecordingResult>;
} {
  let resolveResult!: (r: AudioRecordingResult) => void;
  let rejectResult!: (e: unknown) => void;
  const result = new Promise<AudioRecordingResult>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const startTime = Date.now();

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        rejectResult(new DOMException('Recording cancelled', 'AbortError'));
        return;
      }

      const mimeType = pickMimeType(AUDIO_MIME_CANDIDATES);
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];

      recorder.addEventListener('dataavailable', (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      });

      recorder.addEventListener('stop', () => {
        stream?.getTracks().forEach((t) => t.stop());
        if (cancelled) {
          rejectResult(new DOMException('Recording cancelled', 'AbortError'));
          return;
        }
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
        const duration = (Date.now() - startTime) / 1000;
        resolveResult({ blob, duration, mimeType: mimeType || 'audio/webm' });
      });

      recorder.start(100);

      timeoutId = setTimeout(() => {
        recorder?.stop();
      }, maxSeconds * 1000);
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      rejectResult(err);
    }
  })();

  return {
    stop: () => {
      if (timeoutId) clearTimeout(timeoutId);
      recorder?.stop();
    },
    cancel: () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      recorder?.stop();
    },
    result,
  };
}

/**
 * Records video until `stop()` is called or `maxSeconds` elapses.
 * Captures a thumbnail from the first available video frame.
 */
export function startVideoRecording(maxSeconds = 30): {
  stop: () => void;
  cancel: () => void;
  result: Promise<VideoRecordingResult>;
} {
  let resolveResult!: (r: VideoRecordingResult) => void;
  let rejectResult!: (e: unknown) => void;
  const result = new Promise<VideoRecordingResult>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let cancelled = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const startTime = Date.now();

  async function captureThumbnail(videoStream: MediaStream): Promise<Blob> {
    return new Promise((res) => {
      const video = document.createElement('video');
      video.srcObject = videoStream;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => undefined);

      const onFrame = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth || 320, 320);
        canvas.height = Math.min(video.videoHeight || 240, 240);
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => res(blob ?? new Blob()),
          'image/jpeg',
          0.7,
        );
        video.removeEventListener('timeupdate', onFrame);
      };

      video.addEventListener('timeupdate', onFrame, { once: true });
      // Fallback if timeupdate never fires
      setTimeout(() => {
        if (!video.paused) onFrame();
      }, 500);
    });
  }

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        rejectResult(new DOMException('Recording cancelled', 'AbortError'));
        return;
      }

      const thumbnailPromise = captureThumbnail(stream);
      const mimeType = pickMimeType(VIDEO_MIME_CANDIDATES);
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];

      recorder.addEventListener('dataavailable', (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      });

      recorder.addEventListener('stop', async () => {
        stream?.getTracks().forEach((t) => t.stop());
        if (cancelled) {
          rejectResult(new DOMException('Recording cancelled', 'AbortError'));
          return;
        }
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        const thumbnail = await thumbnailPromise;
        const duration = (Date.now() - startTime) / 1000;
        resolveResult({ blob, thumbnail, duration, mimeType: mimeType || 'video/webm' });
      });

      recorder.start(100);

      timeoutId = setTimeout(() => {
        recorder?.stop();
      }, maxSeconds * 1000);
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      rejectResult(err);
    }
  })();

  return {
    stop: () => {
      if (timeoutId) clearTimeout(timeoutId);
      recorder?.stop();
    },
    cancel: () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      recorder?.stop();
    },
    result,
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}
