import { useEffect, useRef } from "react";
import { TabsList } from "@/components/ui/tabs";

/**
 * TabsListScrollable — no mobile vira lista horizontal com scroll suave;
 * em sm+ vira grid de N colunas (cols, default 7). Faz auto-scroll para a aba ativa.
 * Compartilhado entre ProdutoView (drawer) e ProdutoForm (cadastro/edição).
 */
export function TabsListScrollable({
  children,
  cols = 7,
  className,
}: {
  children: React.ReactNode;
  cols?: number;
  className?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new MutationObserver(() => {
      const active = wrapper.querySelector<HTMLElement>('[data-state="active"]');
      if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    });
    observer.observe(wrapper, { attributes: true, subtree: true, attributeFilter: ["data-state"] });
    const active = wrapper.querySelector<HTMLElement>('[data-state="active"]');
    if (active) active.scrollIntoView({ inline: "center", block: "nearest" });
    return () => observer.disconnect();
  }, []);

  // Mapa estático de cols → classe Tailwind para evitar purge de classes dinâmicas.
  const gridColsClass: Record<number, string> = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
    5: "sm:grid-cols-5",
    6: "sm:grid-cols-6",
    7: "sm:grid-cols-7",
    8: "sm:grid-cols-8",
  };
  const colsCls = gridColsClass[cols] ?? "sm:grid-cols-7";

  return (
    <div ref={wrapperRef} className={`-mx-3 sm:mx-0 overflow-x-auto scrollbar-none ${className ?? ""}`}>
      <TabsList className={`inline-flex w-max gap-1 px-3 h-auto sm:h-10 sm:px-0 sm:w-full sm:grid ${colsCls}`}>
        {children}
      </TabsList>
    </div>
  );
}

export default TabsListScrollable;