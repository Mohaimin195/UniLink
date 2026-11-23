import React, { useState } from 'react';
import { isSafeHttpUrl } from '../lib/api.ts';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const PALETTES = [
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
];

export const UserAvatar: React.FC<UserAvatarProps> = ({ name, avatarUrl, size = 'md' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  const dims =
    size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-16 h-16 text-lg' : 'w-10 h-10 text-sm';

  const initials = (name || 'U')
    .replace(/\(Demo.*\)/gi, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const tone = PALETTES[Math.abs(hash) % PALETTES.length];

  if (avatarUrl && isSafeHttpUrl(avatarUrl) && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={`${name} avatar`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${dims} ${tone} rounded-full flex items-center justify-center font-semibold border border-slate-200/80 dark:border-slate-700/80 shrink-0 select-none`}
    >
      {initials || 'U'}
    </div>
  );
};
