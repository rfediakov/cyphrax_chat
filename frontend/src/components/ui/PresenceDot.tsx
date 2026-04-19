export type PresenceStatus = 'online' | 'afk' | 'offline';

const DOT_CLASS: Record<PresenceStatus, string> = {
  online: 'bg-green-400',
  afk: 'bg-amber-400',
  offline: 'bg-gray-500',
};

interface PresenceDotProps {
  status: PresenceStatus;
  className?: string;
}

export function PresenceDot({ status, className = '' }: PresenceDotProps) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${DOT_CLASS[status]}${className ? ` ${className}` : ''}`}
      title={status}
    />
  );
}
