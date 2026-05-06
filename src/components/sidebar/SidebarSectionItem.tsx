import { Star } from 'lucide-react';
import type { NavLeafItem } from '@/lib/navigation';
import { BADGE_TONE_CLASS, type BadgeInfo } from '@/hooks/useSidebarBadges';

interface SidebarSectionItemProps {
  item: NavLeafItem;
  active: boolean;
  badge?: BadgeInfo;
  starred: boolean;
  onNavigate: (path: string) => void;
  onToggleFavorite: (path: string) => void;
}

export function SidebarSectionItem({
  item,
  active,
  badge,
  starred,
  onNavigate,
  onToggleFavorite,
}: SidebarSectionItemProps) {
  const hasBadge = (badge?.count ?? 0) > 0;
  const Icon = item.icon;
  return (
    <div className="group relative flex items-center">
      {active && (
        <span
          aria-hidden
          className="absolute -left-[13px] top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary"
        />
      )}
      <button
        type="button"
        onClick={() => onNavigate(item.path)}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-1 items-center gap-2 rounded-md px-2 py-2 min-h-[36px] text-left text-[13px] transition ${
          active
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        {Icon && (
          <Icon
            className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground/70'}`}
          />
        )}
        <span className="flex-1 truncate">{item.title}</span>
        {hasBadge && badge && (
          <span
            className={`ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${BADGE_TONE_CLASS[badge.tone]}`}
          >
            {badge.count}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(item.path);
        }}
        className={`shrink-0 rounded p-1.5 transition-opacity hover:bg-accent ${
          starred ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
        }`}
        aria-label={starred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        title={starred ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      >
        <Star className={`h-3.5 w-3.5 ${starred ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />
      </button>
    </div>
  );
}
