import { useState, useRef, useCallback, useEffect } from 'react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import type { Socket } from 'socket.io-client';
import { uploadAttachment } from '../../api/attachments.api';
import { sendRoomMessage, sendDialogMessage } from '../../api/messages.api';
import { useChatStore } from '../../store/chat.store';
import type { Message } from '../../store/chat.store';
import { usePTT } from '../../hooks/usePTT';
import { PTTButton } from './PTTButton';
import { startAudioRecording, startVideoRecording, formatDuration } from '../../lib/mediaRecorder';
import { saveBlob, enqueue } from '../../lib/offlineQueue';
import { useToast } from '../ui/Toast';

function describeMediaError(err: unknown, kind: 'audio' | 'video'): string {
  const device = kind === 'audio' ? 'microphone' : 'camera';
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return `${device[0].toUpperCase() + device.slice(1)} access was blocked. Allow it in your browser settings and try again.`;
      case 'NotFoundError':
      case 'OverconstrainedError':
        return `No ${device} was found on this device.`;
      case 'NotReadableError':
        return `Your ${device} is already in use by another app.`;
      case 'AbortError':
        return '';
    }
  }
  return `Could not record ${kind} message. Please try again.`;
}

const SUPPORTED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documents
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
]);

interface MessageInputProps {
  contextId: string;
  contextType: 'room' | 'dialog';
  dialogUserId?: string;
  replyTo: Message | null;
  onClearReply: () => void;
  socket: Socket | null;
}

export function MessageInput({
  contextId,
  contextType,
  dialogUserId,
  replyTo,
  onClearReply,
  socket,
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachmentId, setPendingAttachmentId] = useState<string | null>(null);
  const [pendingAttachmentName, setPendingAttachmentName] = useState<string | null>(null);
  const [unsupportedFileName, setUnsupportedFileName] = useState<string | null>(null);

  // Audio/video recording state
  type RecordingType = 'audio' | 'video' | null;
  const [recordingType, setRecordingType] = useState<RecordingType>(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const [pendingMsgType, setPendingMsgType] = useState<'audio' | 'video' | null>(null);
  const [pendingDuration, setPendingDuration] = useState<number | null>(null);

  const recordingControlRef = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activityThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const appendMessage = useChatStore((s) => s.appendMessage);
  const { showToast } = useToast();

  const ptt = usePTT(socket, contextType === 'room' ? contextId : null);

  // Auto-resize textarea
  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = 24;
    const maxHeight = lineHeight * 5;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [text]);

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const emitTyping = useCallback(() => {
    if (!socket) return;
    if (typingThrottleRef.current) return;
    const payload = contextType === 'room' ? { roomId: contextId } : { dialogId: contextId };
    socket.emit('typing', payload);
    typingThrottleRef.current = setTimeout(() => {
      typingThrottleRef.current = null;
    }, 1000);
  }, [socket, contextId, contextType]);

  const emitActivity = useCallback(() => {
    if (!socket) return;
    if (activityThrottleRef.current) return;
    socket.emit('activity');
    activityThrottleRef.current = setTimeout(() => {
      activityThrottleRef.current = null;
    }, 10000);
  }, [socket]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    emitTyping();
    emitActivity();
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setText((prev) => prev + emojiData.emoji);
    textareaRef.current?.focus();
    setShowEmoji(false);
  };

  const handleUploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const { data } = await uploadAttachment(file, contextId, contextType);
        setPendingAttachmentId(data.id);
        setPendingAttachmentName(data.filename);
      } catch (err) {
        console.error('[MessageInput] File upload failed:', err);
        showToast('File upload failed. Please try again.', 'error');
      } finally {
        setUploading(false);
      }
    },
    [contextId, contextType, showToast]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!SUPPORTED_MIME_TYPES.has(file.type)) {
        setUnsupportedFileName(file.name);
        setPendingAttachmentId(null);
        setPendingAttachmentName(null);
      } else {
        setUnsupportedFileName(null);
        handleUploadFile(file);
      }
    }
    e.target.value = '';
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const file = e.clipboardData.files[0];
      if (file && file.type.startsWith('image/')) {
        e.preventDefault();
        handleUploadFile(file);
      }
    },
    [handleUploadFile]
  );

  const startElapsedTimer = () => {
    setRecordingElapsed(0);
    recordingTimerRef.current = setInterval(() => {
      setRecordingElapsed((s) => s + 1);
    }, 1000);
  };

  const stopElapsedTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const handleStartAudio = async () => {
    if (recordingType) return;
    setRecordingType('audio');
    startElapsedTimer();
    try {
      const ctrl = startAudioRecording(60);
      recordingControlRef.current = ctrl;
      const { blob, duration, mimeType } = await ctrl.result;
      stopElapsedTimer();
      setRecordingType(null);
      await sendMediaBlob(blob, duration, mimeType, 'audio');
    } catch (err) {
      stopElapsedTimer();
      setRecordingType(null);
      const message = describeMediaError(err, 'audio');
      if (message) {
        console.error('[MessageInput] Audio recording failed:', err);
        showToast(message, 'error');
      }
    }
  };

  const handleStartVideo = async () => {
    if (recordingType) return;
    setRecordingType('video');
    startElapsedTimer();
    try {
      const ctrl = startVideoRecording(30);
      recordingControlRef.current = ctrl;
      const { blob, thumbnail, duration, mimeType } = await ctrl.result;
      stopElapsedTimer();
      setRecordingType(null);
      await sendMediaBlob(blob, duration, mimeType, 'video', thumbnail);
    } catch (err) {
      stopElapsedTimer();
      setRecordingType(null);
      const message = describeMediaError(err, 'video');
      if (message) {
        console.error('[MessageInput] Video recording failed:', err);
        showToast(message, 'error');
      }
    }
  };

  const handleStopRecording = () => {
    recordingControlRef.current?.stop();
  };

  const handleCancelRecording = () => {
    recordingControlRef.current?.cancel();
    stopElapsedTimer();
    setRecordingType(null);
    setRecordingElapsed(0);
  };

  const sendMediaBlob = useCallback(
    async (
      blob: Blob,
      duration: number,
      mimeType: string,
      msgType: 'audio' | 'video',
      thumbnail?: Blob,
    ) => {
      setUploading(true);
      setPendingMsgType(msgType);
      setPendingDuration(duration);
      try {
        if (!navigator.onLine) {
          // Offline: persist blobs to IndexedDB, enqueue send action
          const blobKey = `draft:${crypto.randomUUID()}`;
          await saveBlob(blobKey, blob);
          let thumbKey: string | undefined;
          if (thumbnail) {
            thumbKey = `draft:${crypto.randomUUID()}`;
            await saveBlob(thumbKey, thumbnail);
          }
          await enqueue({
            type: `send_${msgType}`,
            payload: { blobKey, thumbKey, contextId, contextType, dialogUserId, duration, mimeType },
          });
          return;
        }

        // Upload media blob
        const mediaFile = new File([blob], `recording.${mimeType.split('/')[1]?.split(';')[0] ?? 'webm'}`, { type: mimeType });
        const { data: mediaAttachment } = await uploadAttachment(mediaFile, contextId, contextType);

        // Upload thumbnail for video
        let thumbAttachmentId: string | undefined;
        if (thumbnail) {
          const thumbFile = new File([thumbnail], 'thumbnail.jpg', { type: 'image/jpeg' });
          const { data: thumbData } = await uploadAttachment(thumbFile, contextId, contextType);
          thumbAttachmentId = thumbData.id;
        }

        const payload = {
          content: ' ',
          attachmentId: mediaAttachment.id,
          type: msgType,
          duration: Math.round(duration),
        };

        const response =
          contextType === 'room'
            ? await sendRoomMessage(contextId, payload)
            : await sendDialogMessage(dialogUserId ?? contextId, payload);

        // If video, link thumbnail attachment to same message via a second message? No — attach it as second attachment.
        // For now: thumbnail is shown from the second attachment slot in MessageItem.
        // We handle it by sending a separate attachment for thumbnail — but the API only supports one attachmentId per message.
        // Simpler approach: encode thumbnail URL into the message content or store thumbAttachmentId in the message.
        // TODO(agent-E): video thumbnail is stored as a separate attachment but currently not linked to the message.
        // Recipients will see a grey placeholder until a proper thumbnail API is added.
        void thumbAttachmentId;

        appendMessage(contextId, response.data.message);
      } catch (err) {
        console.error(`[MessageInput] Failed to send ${msgType} message:`, err);
        showToast(`Failed to send ${msgType} message. Please try again.`, 'error');
      } finally {
        setUploading(false);
        setPendingMsgType(null);
        setPendingDuration(null);
      }
    },
    [contextId, contextType, dialogUserId, appendMessage, showToast],
  );

  const sendMessage = useCallback(async () => {
    const content = text.trim();
    if (!content && !pendingAttachmentId) return;

    // Snapshot draft state so we can fully restore it on failure (text, the
    // attached file, and any reply context).
    const snapshot = {
      text: content,
      attachmentId: pendingAttachmentId,
      attachmentName: pendingAttachmentName,
      replyTo,
    };

    const payload = {
      content: content || ' ',
      replyToId: replyTo?._id,
      attachmentId: pendingAttachmentId ?? undefined,
    };

    setText('');
    setPendingAttachmentId(null);
    setPendingAttachmentName(null);
    onClearReply();

    try {
      const response =
        contextType === 'room'
          ? await sendRoomMessage(contextId, payload)
          : await sendDialogMessage(dialogUserId ?? contextId, payload);
      // Show the sent message immediately; socket broadcast is deduped in the store by _id.
      appendMessage(contextId, response.data.message);
    } catch {
      // Restore the entire draft, not just the text — otherwise the user
      // silently loses their attached file and reply context.
      setText(snapshot.text);
      if (snapshot.attachmentId) setPendingAttachmentId(snapshot.attachmentId);
      if (snapshot.attachmentName) setPendingAttachmentName(snapshot.attachmentName);
      showToast('Failed to send message. Please try again.', 'error');
    }
  }, [text, pendingAttachmentId, pendingAttachmentName, replyTo, contextId, contextType, dialogUserId, onClearReply, appendMessage, showToast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    emitActivity();
  };

  return (
    <div className="shrink-0 border-t border-gray-700 bg-gray-900 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center justify-between bg-gray-800 border-l-2 border-blue-400 px-3 py-1.5 mb-2 rounded-r">
          <div className="min-w-0">
            <span className="text-xs font-medium text-blue-400">
              Replying to @{replyTo.author.username}
            </span>
            <p className="text-xs text-gray-400 truncate">{replyTo.content}</p>
          </div>
          <button
            onClick={onClearReply}
            className="ml-2 text-gray-400 hover:text-white transition-colors shrink-0"
            aria-label="Cancel reply"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Unsupported file type error */}
      {unsupportedFileName && (
        <div className="flex items-center gap-2 mb-2 bg-red-900/40 border border-red-700/60 px-3 py-1.5 rounded">
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-red-300 font-medium">File type not supported</p>
            <p className="text-xs text-red-400/80 truncate">{unsupportedFileName}</p>
          </div>
          <button
            onClick={() => setUnsupportedFileName(null)}
            className="text-red-400 hover:text-red-200 transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Pending attachment indicator */}
      {pendingAttachmentName && (
        <div className="flex items-center gap-2 mb-2 bg-gray-800 px-3 py-1.5 rounded">
          <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-xs text-gray-300 truncate flex-1">{pendingAttachmentName}</span>
          <button
            onClick={() => { setPendingAttachmentId(null); setPendingAttachmentName(null); }}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Remove attachment"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Recording in progress UI */}
      {recordingType && (
        <div className="flex items-center gap-3 mb-2 bg-gray-800 border border-red-700/60 px-3 py-1.5 rounded-lg">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
          <span className="text-xs text-red-300 font-medium">
            {recordingType === 'audio' ? 'Recording audio' : 'Recording video'}&nbsp;·&nbsp;
            <span className="tabular-nums">{formatDuration(recordingElapsed)}</span>
            {recordingType === 'audio' ? ' / 1:00' : ' / 0:30'}
          </span>
          <div className="flex-1" />
          <button
            onClick={handleStopRecording}
            className="text-xs text-white bg-blue-600 hover:bg-blue-500 px-2 py-0.5 rounded transition-colors"
          >
            Send
          </button>
          <button
            onClick={handleCancelRecording}
            className="text-xs text-gray-400 hover:text-white transition-colors"
            aria-label="Cancel recording"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Pending media upload indicator */}
      {pendingMsgType && (
        <div className="flex items-center gap-2 mb-2 bg-gray-800 px-3 py-1.5 rounded">
          <div className="w-4 h-4 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin shrink-0" />
          <span className="text-xs text-gray-300">
            Uploading {pendingMsgType}
            {pendingDuration != null ? ` · ${formatDuration(pendingDuration)}` : ''}…
          </span>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Emoji button */}
        <div className="relative" ref={emojiRef}>
          <button
            onClick={() => setShowEmoji((s) => !s)}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800"
            aria-label="Emoji picker"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {showEmoji && (
            <div className="absolute bottom-10 left-0 z-50">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={'dark' as Parameters<typeof EmojiPicker>[0]['theme']}
                height={350}
                width={300}
              />
            </div>
          )}
        </div>

        {/* File attachment button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-800 disabled:opacity-50"
          aria-label="Attach file"
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          accept="*/*"
        />

        {/* Audio record button */}
        <button
          onClick={recordingType === 'audio' ? handleStopRecording : handleStartAudio}
          disabled={!!recordingType && recordingType !== 'audio' || uploading}
          className={`p-2 transition-colors rounded-lg ${
            recordingType === 'audio'
              ? 'text-red-400 bg-red-900/30 hover:bg-red-900/50'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          } disabled:opacity-50`}
          aria-label={recordingType === 'audio' ? 'Stop recording' : 'Record audio message'}
          title={recordingType === 'audio' ? 'Stop & send' : 'Record audio message'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* Video record button */}
        <button
          onClick={recordingType === 'video' ? handleStopRecording : handleStartVideo}
          disabled={!!recordingType && recordingType !== 'video' || uploading}
          className={`p-2 transition-colors rounded-lg ${
            recordingType === 'video'
              ? 'text-red-400 bg-red-900/30 hover:bg-red-900/50'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          } disabled:opacity-50`}
          aria-label={recordingType === 'video' ? 'Stop recording' : 'Record video message'}
          title={recordingType === 'video' ? 'Stop & send' : 'Record video message'}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </button>

        {/* PTT button — rooms only */}
        {contextType === 'room' && (
          <PTTButton roomId={contextId} ptt={ptt} />
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="flex-1 resize-none bg-gray-800 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 border border-gray-700 min-h-[38px] max-h-[120px] overflow-y-auto"
        />

        {/* Send button */}
        <button
          onClick={sendMessage}
          disabled={!text.trim() && !pendingAttachmentId}
          className="p-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors shrink-0"
          aria-label="Send message"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
