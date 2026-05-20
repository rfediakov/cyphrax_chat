import { useState, useRef } from 'react';
import type { Message } from '../../store/chat.store';
import { useAuthStore } from '../../store/auth.store';
import { useAuthorizedAttachmentBlobUrl } from '../../hooks/useAuthorizedAttachmentBlobUrl';
import { AudioMessage } from './AudioMessage';
import { VideoMessage } from './VideoMessage';
import api from '../../api/axios';

export function SystemMessageItem({ message }: { message: Message }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5">
      <div className="flex-1 h-px bg-gray-700/60" />
      <span className="text-xs text-gray-500 shrink-0 select-none">{message.content}</span>
      <div className="flex-1 h-px bg-gray-700/60" />
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onDelete: (message: Message) => void;
  isAdmin?: boolean;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImageAttachment({ attachment }: { attachment: NonNullable<Message['attachments']>[0] }) {
  // <img src> can't send Authorization headers, so fetch the file via the
  // authenticated API client and expose it as a blob: URL.
  const { blobUrl, loading, error } = useAuthorizedAttachmentBlobUrl(attachment.url);

  if (loading) {
    return (
      <div className="w-32 h-32 mt-1 rounded-lg border border-gray-700 bg-gray-800 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-gray-500 border-t-blue-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="mt-1 p-2 bg-gray-700 rounded-lg border border-gray-600 max-w-xs">
        <p className="text-xs text-red-300">Image unavailable</p>
        <p className="text-xs text-gray-400 truncate">{attachment.filename}</p>
      </div>
    );
  }

  return (
    <a href={blobUrl} target="_blank" rel="noopener noreferrer">
      <img
        src={blobUrl}
        alt={attachment.filename}
        className="max-w-xs max-h-48 rounded-lg object-cover mt-1 border border-gray-700 hover:opacity-90 transition-opacity"
        loading="lazy"
      />
    </a>
  );
}

function FileAttachment({ attachment }: { attachment: NonNullable<Message['attachments']>[0] }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (downloading) return;
    setDownloading(true);
    try {
      // Bypass axios.baseURL by hitting the absolute API path directly so the
      // attachment download still goes through the auth interceptor.
      const reqPath = attachment.url.replace(/^\/api\/v1\//, '');
      const { data } = await api.get<Blob>(reqPath, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <a
      href={attachment.url}
      onClick={handleDownload}
      className="flex items-center gap-2 mt-1 p-2 bg-gray-700 rounded-lg border border-gray-600 hover:bg-gray-600 transition-colors max-w-xs"
    >
      <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm text-gray-200 truncate">{attachment.filename}</p>
        <p className="text-xs text-gray-400">
          {downloading ? 'Downloading…' : formatSize(attachment.size)}
        </p>
      </div>
    </a>
  );
}

function AttachmentPreview({ attachment }: { attachment: NonNullable<Message['attachments']>[0] }) {
  const isImage = attachment.mimetype.startsWith('image/');
  return isImage ? <ImageAttachment attachment={attachment} /> : <FileAttachment attachment={attachment} />;
}

function ReplyPreview({ replyTo }: { replyTo: Message }) {
  if (replyTo.deletedAt) {
    return (
      <div className="border-l-2 border-gray-500 pl-2 mb-1 text-xs text-gray-500 italic">
        (message deleted)
      </div>
    );
  }
  return (
    <div className="border-l-2 border-blue-400 pl-2 mb-1">
      <span className="text-xs font-medium text-blue-400">
        @{replyTo.author.username}
      </span>
      <p className="text-xs text-gray-400 truncate">{replyTo.content}</p>
    </div>
  );
}

export function MessageItem({ message, onReply, onEdit, onDelete, isAdmin }: MessageItemProps) {
  const currentUser = useAuthStore((s) => s.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwnMessage = currentUser?._id === message.author._id;
  const canEdit = isOwnMessage && !message.deletedAt;
  const canDelete = (isOwnMessage || isAdmin) && !message.deletedAt;

  const initials = message.author.username.slice(0, 2).toUpperCase();

  const handleMouseLeave = () => {
    // Small delay so clicking menu items doesn't cause flicker
    setTimeout(() => setMenuOpen(false), 150);
  };

  const handleLongPressStart = () => {
    longPressTimer.current = setTimeout(() => setMenuOpen(true), 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  return (
    <div
      className="group relative flex gap-3 px-3 py-1.5 hover:bg-gray-800/50 rounded-lg transition-colors"
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleLongPressStart}
      onTouchEnd={handleLongPressEnd}
    >
      {/* Avatar */}
      <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white mt-0.5">
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-white">
            {message.author.username}
          </span>
          <span className="text-xs text-gray-500">{formatTime(message.createdAt)}</span>
          {message.editedAt && !message.deletedAt && (
            <span className="text-xs text-gray-500 italic">(edited)</span>
          )}
        </div>

        {/* Reply quoted preview */}
        {message.replyTo && <ReplyPreview replyTo={message.replyTo} />}

        {/* Message body */}
        {message.deletedAt ? (
          <p className="text-sm text-gray-500 italic">(message deleted)</p>
        ) : message.type === 'audio' ? (
          message.attachments && message.attachments.length > 0 ? (
            <AudioMessage
              src={message.attachments[0].url}
              duration={message.duration ?? null}
            />
          ) : (
            <p className="text-sm text-gray-500 italic">(audio unavailable)</p>
          )
        ) : message.type === 'video' ? (
          message.attachments && message.attachments.length > 0 ? (
            <VideoMessage
              src={message.attachments[0].url}
              thumbnailSrc={message.attachments[1]?.url}
              duration={message.duration ?? null}
            />
          ) : (
            <p className="text-sm text-gray-500 italic">(video unavailable)</p>
          )
        ) : (
          <>
            <p className="text-sm text-gray-200 whitespace-pre-wrap break-words">
              {message.content}
            </p>
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-col gap-1">
                {message.attachments.map((att) => (
                  <AttachmentPreview key={att._id} attachment={att} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Context menu trigger (desktop hover) */}
      <div
        className="absolute right-2 top-1 hidden group-hover:flex items-center gap-0.5"
        ref={menuRef}
      >
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          aria-label="Message actions"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-7 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[120px]">
            {!message.deletedAt && (
              <button
                onClick={() => { onReply(message); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
              >
                Reply
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => { onEdit(message); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => { onDelete(message); setMenuOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
