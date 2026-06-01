import { useEffect, useRef, useState } from "react";

/**
 * Revela um elemento quando ele entra na viewport (scroll-triggered animation).
 * Usa IntersectionObserver (sem dependências) e respeita prefers-reduced-motion:
 * se o usuário pediu menos movimento, o elemento já nasce visível.
 *
 * Uso:
 *   const { ref, visible } = useScrollReveal<HTMLDivElement>();
 *   <div ref={ref} className={visible ? "reveal-in" : "reveal-init"} />
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const { threshold = 0.15, rootMargin = "0px 0px -10% 0px", once = true } = options ?? {};
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Acessibilidade: sem animação se o usuário prefere movimento reduzido.
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        });
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, visible };
}
