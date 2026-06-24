import { useEffect, useRef, useState } from 'react';

interface StatItem {
  target: number;
  display: (value: number) => string;
  label: string;
}

const STATS: StatItem[] = [
  { target: 5, display: (v) => v.toString(), label: 'formatos por ideia' },
  { target: 4, display: (v) => v.toString(), label: 'IAs especializadas' },
  { target: 12, display: (v) => `${v} min`, label: 'do tema ao vídeo' },
  { target: 100, display: (v) => v.toString(), label: '% conforme o CFP' },
];

const DURATION = 1100;

export default function PlatformStats() {
  const sectionRef = useRef<HTMLElement>(null);
  const [values, setValues] = useState<number[]>(() => STATS.map(() => 0));

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;

    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    if (prefersReduced) {
      setValues(STATS.map((s) => s.target));
      return;
    }

    let rafId = 0;
    let started = false;

    const runCountUp = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / DURATION, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setValues(STATS.map((s) => Math.round(eased * s.target)));
        if (p < 1) {
          rafId = requestAnimationFrame(tick);
        }
      };
      rafId = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            runCountUp();
            observer.disconnect();
          }
        });
      },
      { threshold: 0.6 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <section ref={sectionRef} className="bg-pp-forest-deep text-pp-bg">
      <div className="mx-auto max-w-[1200px] px-7 py-[34px] grid [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))] gap-6 border-t border-pp-bg/[0.08]">
        {STATS.map((stat, i) => (
          <div key={stat.label} className="text-center">
            <div className="font-display font-bold text-[40px] text-pp-sage-light">
              {stat.display(values[i])}
            </div>
            <div className="text-[13px] text-pp-bg/60 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
