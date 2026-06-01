import { ReactNode } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: ReactNode;
  /** Atraso em ms para efeito escalonado entre elementos vizinhos. */
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}

/**
 * Envolve qualquer conteúdo e o revela suavemente (fade + slide-up) quando
 * entra na viewport. Respeita prefers-reduced-motion via useScrollReveal.
 */
export default function Reveal({ children, delay = 0, className, as = "div" }: RevealProps) {
  const { ref, visible } = useScrollReveal<HTMLElement>();
  const Tag = as as keyof JSX.IntrinsicElements;

  return (
    <Tag
      ref={ref as never}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform motion-reduce:transition-none",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        className,
      )}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
