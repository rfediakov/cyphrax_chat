import { useState, useRef, useCallback, useEffect } from 'react';
import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react';
import { uploadAttachment } from '../../api/attachments.api';
import { sendRoomMessage, sendDialogMessage } from '../../api/messages.api';
import { useChatStore } from '../../store/chat.store';
import { useSocket } from '../../hooks/useSocket';
import type { Message } from '../../store/chat.store';

interface MessageInputProps {
  contextId: string;
  contextType: 'room' | 'dialog';
  dialogUserId?: string;
  replyTo: Message | null;
  onClearReply: () => void;
}

export function MessageInput({
  contextId,
  contextType,
  dialogUserId,
  replyTo,
  onClearReply,
}: MessageInputProps) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachmentId, setPendingAttachmentId] = useState<string | null>(null);
  const [pendingAttachmentName, setPendingAttachmentName] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const appendMessage = useChatStore((s) => s.appendMessage);
  const { socket } = useSocket();

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
    socket.emit('typing', { contextId, contextType });
    typingThrottleRef.current = setTimeout(() => {
      typingThrottleRef.current = null;
    }, 1000);
  }, [socket, contextId, contextType]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    emitTyping();
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
      } catch {
        alert('File upload failed. Please try again.');
      } finally {
        setUploading(false);
      }
    },
    [contextId, contextType]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUploadFile(file);
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

  const sendMessage = useCallback(async () => {
    const content = text.trim();
    if (!content && !pendingAttachmentId) return;

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
      // Restore text if send failed
      setText(content);
    }
  }, [text, pendingAttachmentId, replyTo, contextId, contextType, dialogUserId, onClearReply, appendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
