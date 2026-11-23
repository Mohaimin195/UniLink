import React from 'react';

export const BrandMark: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    aria-hidden="true"
    className="shrink-0"
  >
    <rect width="64" height="64" rx="16" className="fill-indigo-600 dark:fill-indigo-500" />
    <path
      d="M21 20v14c0 6.6 4.9 11.5 11 11.5S43 40.6 43 34V20"
      stroke="#FFFFFF"
      strokeWidth="5.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="43" cy="20" r="3.6" className="fill-emerald-400" />
  </svg>
);
