import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Floating button shown after the user scrolls past `threshold` px on
 * mobile. Positioned above the bottom nav and below the QuickActions FAB
 * to avoid overlap.
 */
interface BackToTopButtonProps {
  threshold?: number;
}

export function BackToTopButton({ threshold = 900 }: BackToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return (
    <Button
      size="icon"
      variant="outline"
      aria-label="Voltar ao topo"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={cn(
        'fixed left-4 z-40 h-10 w-10 rounded-full border border-border/60 bg-background/95 shadow-md backdrop-blur transition-all md:hidden',
        'supports-[backdrop-filter]:bg-background/80',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
    >
      <ArrowUp className="h-4 w-4" />
    </Button>
  );
}