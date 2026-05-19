type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-16 h-16 text-xl',
  xl: 'w-20 h-20 text-2xl',
};

/** Deterministic hue from a string so avatars stay stable across renders. */
function avatarHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

interface UserAvatarProps {
  username: string;
  size?: AvatarSize;
  className?: string;
}

export function UserAvatar({ username, size = 'lg', className = '' }: UserAvatarProps) {
  const hue = avatarHue(username || '?');
  const initials = (username || '?').slice(0, 2).toUpperCase();
  return (
    <div
      className={`${SIZE_CLASS[size]} rounded-full flex items-center justify-center font-bold text-white select-none shrink-0 ${className}`}
      style={{ backgroundColor: `hsl(${hue} 55% 38%)` }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

export default UserAvatar;
