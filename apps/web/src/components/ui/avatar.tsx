import Image from 'next/image';

function getColorFromSeed(value: string) {
  const palette = ['#E7E5E4', '#CCFBF1', '#FDE68A', '#E0E7FF', '#FECACA', '#DDD6FE'];
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: { className: 'h-7 w-7 text-[10px]', width: 28, height: 28 },
  md: { className: 'h-8 w-8 text-[11px]', width: 32, height: 32 },
  lg: { className: 'h-10 w-10 text-[12px]', width: 40, height: 40 },
};

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  const background = getColorFromSeed(name);

  if (src) {
    const dims = sizeMap[size];
    return (
      <Image
        src={src}
        alt={name}
        width={dims.width}
        height={dims.height}
        unoptimized
        className={['rounded-full object-cover', dims.className, className].join(' ')}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={['flex items-center justify-center rounded-full font-medium text-[var(--color-text)]', sizeMap[size].className, className].join(' ')}
      style={{ backgroundColor: background }}
    >
      {initials}
    </div>
  );
}
