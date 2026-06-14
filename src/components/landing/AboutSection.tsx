import { Play, Award, Heart } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface AboutSectionProps {
  title?: string;
  name?: string;
  bio?: string;
  crp?: string;
  photoUrl?: string;
  aboutImageUrl?: string;
  aboutVideoUrl?: string;
  approaches?: string[];
  /** Apresentação automática dos cards da bio (5s) + início do vídeo ao final. Desligado no editor. */
  autoplay?: boolean;
}

export default function AboutSection({ title, name, bio, crp, photoUrl, aboutImageUrl, aboutVideoUrl, approaches, autoplay = true }: AboutSectionProps) {
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [activeCard, setActiveCard] = useState(0);
  // Passagem automática: só arranca quando a seção entra na tela; o clique do usuário a interrompe de vez.
  const [autoplayArmed, setAutoplayArmed] = useState(false);
  const [autoplayStopped, setAutoplayStopped] = useState(false);
  const cardsRef = useRef<HTMLDivElement>(null);
  const displayImage = aboutImageUrl || photoUrl;

  // Encerra a passagem automática quando o usuário assume o controle (clique em card, indicador ou play).
  const stopAutoplay = () => setAutoplayStopped(true);

  // Abordagens em 2 faixas (marquee). Repete o conjunto até ter volume pra preencher a faixa, pra o
  // loop ficar contínuo mesmo quando o profissional tem poucas abordagens.
  const fillRow = (arr: string[], min: number) => {
    if (arr.length === 0) return [] as string[];
    const out = [...arr];
    while (out.length < min) out.push(...arr);
    return out;
  };
  const approachList = approaches ?? [];
  const half = Math.ceil(approachList.length / 2);
  const marqueeRow1 = fillRow(approachList.slice(0, half), 8);
  const marqueeRow2 = fillRow(approachList.slice(half).length ? approachList.slice(half) : approachList, 8);

  const paragraphs = bio
    ? bio.split('\n').filter(p => p.trim() !== '')
    : ["Profissional dedicado(a) à saúde mental e ao bem-estar emocional, com experiência em Terapia Cognitivo-Comportamental."];

  // Arma a passagem automática só quando os cards entram na viewport (uma vez).
  // Decisão 13/06: anima pra todos (não respeita "reduzir movimento") — animação é parte do design da landing.
  useEffect(() => {
    if (!autoplay || paragraphs.length <= 1) return;
    const el = cardsRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAutoplayArmed(true);
          obs.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [autoplay, paragraphs.length]);

  // A cada 5s avança um card; ao passar do último, inicia o vídeo (se houver) e encerra a passagem automática.
  // O timer reinicia a cada card (depende de activeCard), dando 5s exatos por card.
  useEffect(() => {
    if (!autoplay || !autoplayArmed || autoplayStopped || isVideoPlaying || paragraphs.length <= 1) return;
    const id = window.setTimeout(() => {
      if (activeCard >= paragraphs.length - 1) {
        setAutoplayStopped(true);
        if (aboutVideoUrl) setIsVideoPlaying(true);
      } else {
        setActiveCard((c) => c + 1);
      }
    }, 5000);
    return () => window.clearTimeout(id);
  }, [autoplay, autoplayArmed, autoplayStopped, isVideoPlaying, activeCard, paragraphs.length, aboutVideoUrl]);

  // Helper to get embed url if it's youtube or vimeo
  const getEmbedUrl = (url: string) => {
    if (!url) return "";
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const videoId = url.includes('youtu.be') ? url.split('youtu.be/')[1] : url.split('v=')[1]?.split('&')[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }
    if (url.includes('vimeo.com')) {
      const videoId = url.split('vimeo.com/')[1];
      return `https://player.vimeo.com/video/${videoId}?autoplay=1`;
    }
    return url;
  };

  const isMp4 = aboutVideoUrl?.toLowerCase().endsWith('.mp4');

  // Helper para destacar palavras-chave automaticamente ou usando **negrito**
  const renderWithHighlights = (text: string) => {
    // Divide o texto onde encontrar **palavra**
    const parts = text.split(/(\*\*.*?\*\*)/g);
    
    // Lista de palavras-chave para destacar automaticamente
    const autoKeywords = [
      "React", "Flutter", "Python", "JavaScript", "ClaudeCode", "Gemini", "OpenAI", 
      "saúde mental", "tecnologia", "cuidado emocional", "empatia", "compreensão", 
      "soluções personalizadas", "Terapia Cognitivo-Comportamental", "TCC",
      "autoconhecimento", "ansiedade", "depressão", "desenvolvedor", "designer",
      "transformação", "bem-estar", "escuta ativa", "psicologia", "psicólogo", "psicóloga"
    ];

    return parts.map((part, i) => {
      // Se for uma parte marcada com **
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-bold text-foreground drop-shadow-sm">{part.slice(2, -2)}</strong>;
      }
      
      // Auto-bolding para as palavras-chave na parte normal do texto
      let result: React.ReactNode[] = [part];
      autoKeywords.forEach(keyword => {
        // Regex para encontrar a palavra exata ignorando maiúsculas/minúsculas
        const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
        result = result.flatMap(r => {
          if (typeof r === 'string') {
            const split = r.split(regex);
            return split.map((s, j) => 
              s.toLowerCase() === keyword.toLowerCase() 
                ? <strong key={`${i}-${j}-${keyword}`} className="font-bold text-foreground drop-shadow-sm">{s}</strong> 
                : s
            );
          }
          return r;
        });
      });
      return <span key={i}>{result}</span>;
    });
  };

  return (
    <>
      {/* Auras num wrapper que recorta (overflow-hidden), pra o <Section> do Sobre poder liberar
          o overflow (clip=false) e a coluna sticky da foto voltar a funcionar. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3" />
      </div>

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        <div className="flex flex-col lg:flex-row gap-16 items-start max-w-6xl mx-auto">

          {/* Media Column (Sticky) */}
          <div className="w-full lg:w-1/2 relative group lg:sticky lg:top-24 flex flex-col">
            {/* Soft decorative border behind */}
            <div className="absolute -inset-4 bg-gradient-to-tr from-primary/20 to-accent/20 rounded-[2rem] rotate-3 scale-[0.98] transition-transform duration-500 group-hover:rotate-6 group-hover:scale-100" />

            {/* Moldura: o padding (p-3) cria a borda visivel ao redor da imagem,
                como um porta-retrato. A imagem (h-auto) define a proporcao. */}
            <div className="relative rounded-2xl shadow-2xl shadow-foreground/15 bg-card mx-auto w-full max-w-md p-3">
              {isVideoPlaying && aboutVideoUrl ? (
                isMp4 ? (
                  <video
                    src={aboutVideoUrl}
                    autoPlay
                    controls
                    playsInline
                    className="block w-full h-auto max-h-[60vh]"
                    onEnded={() => setIsVideoPlaying(false)}
                  />
                ) : (
                  <div className="aspect-video w-full">
                    <iframe
                      src={getEmbedUrl(aboutVideoUrl)}
                      className="w-full h-full"
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                )
              ) : (
                /* Wrapper que ENVOLVE a imagem: overflow-hidden + rounded-2xl
                   recortam a imagem com cantos arredondados. O wrapper usa
                   w-fit + h-auto pra COLAR no tamanho real da foto (sem espaco
                   sobrando), entao o arredondamento aparece na propria foto. */
                <div className="relative overflow-hidden rounded-2xl mx-auto w-fit">
                  {displayImage ? (
                    <img
                      src={displayImage}
                      alt={name}
                      className="block w-auto h-auto max-h-[60vh] max-w-full object-contain transition-transform duration-700 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="w-full aspect-[4/5] bg-gradient-to-br from-primary/10 to-accent/10 flex items-center justify-center">
                      <Heart className="w-20 h-20 text-primary/30" />
                    </div>
                  )}

                  {/* Video Play Button Overlay — dentro do wrapper, herda o recorte */}
                  {aboutVideoUrl && (
                    <div className="absolute inset-0 bg-black/10 transition-all duration-300 group-hover:bg-black/30 pointer-events-none">
                      <button
                        onClick={() => { stopAutoplay(); setIsVideoPlaying(true); }}
                        className="absolute bottom-6 left-6 w-16 h-16 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-xl text-primary hover:scale-110 transition-transform duration-300 pointer-events-auto"
                        aria-label="Assistir vídeo de apresentação"
                      >
                        <Play className="w-6 h-6 ml-1" fill="currentColor" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Text Column */}
          <div className="w-full lg:w-1/2 space-y-8">
            <div className="space-y-4">
              <h2 className="font-heading text-4xl md:text-5xl font-bold text-foreground leading-tight">
                {title || "Muito prazer, sou o(a)"}<br/> 
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">
                  {name || "Profissional"}
                </span>
              </h2>
            </div>

            <div ref={cardsRef} className="relative pt-8 pb-4">
              <div className="grid relative" onClick={() => { stopAutoplay(); setActiveCard((prev) => (prev + 1) % paragraphs.length); }}>
                {paragraphs.map((p, i) => {
                  const tintColors = [
                    "bg-amber-500/15 dark:bg-amber-400/10", // Amarelo
                    "bg-blue-500/15 dark:bg-blue-400/10",   // Azul
                    "bg-emerald-500/15 dark:bg-emerald-400/10", // Verde
                    "bg-rose-500/15 dark:bg-rose-400/10",   // Rosa
                    "bg-purple-500/15 dark:bg-purple-400/10" // Roxo
                  ];
                  const tintClass = tintColors[i % tintColors.length];
                  
                  // Calculate relative index for stack positioning
                  let relIndex = i - activeCard;
                  if (relIndex < 0) relIndex += paragraphs.length; // cycle

                  const isTop = relIndex === 0;
                  const isSecond = relIndex === 1;
                  const isThird = relIndex >= 2;
                  
                  let transformClass = "opacity-0 scale-90 translate-y-12 pointer-events-none";

                  if (isTop) {
                    // Top card is fully visible and interactive
                    transformClass = "opacity-100 scale-100 translate-y-0 rotate-0 shadow-xl cursor-pointer hover:-translate-y-2";
                  } else if (isSecond) {
                    // Second card is fully solid (opacity-100), just shifted and scaled
                    transformClass = "opacity-100 scale-95 translate-y-5 md:translate-y-6 rotate-1 md:rotate-2 shadow-md pointer-events-none";
                  } else if (isThird) {
                    // Third and beyond are solid but stacked together
                    transformClass = "opacity-100 scale-[0.90] translate-y-10 md:translate-y-12 rotate-2 md:rotate-3 shadow-sm pointer-events-none";
                  }
                  
                  return (
                    <div 
                      key={i} 
                      className={`col-start-1 row-start-1 p-8 md:p-10 rounded-3xl border border-foreground/5 backdrop-blur-sm transition-all duration-500 origin-bottom overflow-hidden ${transformClass}`}
                      style={{ zIndex: 30 - relIndex }}
                    >
                      {/* Fundo 100% sólido para o texto de trás não vazar (vazar = bleeding) */}
                      <div className="absolute inset-0 bg-card -z-20" />
                      
                      {/* Camada de cor suave e chamativa */}
                      <div className={`absolute inset-0 -z-10 ${tintClass}`} />

                      {/* Efeito de "fita/furo" de bloco de notas no canto */}
                      <div className="absolute -top-3 left-8 w-6 h-6 bg-background rounded-full border border-inherit shadow-inner flex items-center justify-center">
                        <div className="w-2 h-2 bg-foreground/10 rounded-full" />
                      </div>
                      <div className="absolute -top-3 left-16 w-6 h-6 bg-background rounded-full border border-inherit shadow-inner flex items-center justify-center">
                        <div className="w-2 h-2 bg-foreground/10 rounded-full" />
                      </div>
                      
                      <p className="text-base md:text-xl font-medium leading-relaxed opacity-90 pb-6 text-foreground">
                        {renderWithHighlights(p)}
                      </p>

                      {isTop && paragraphs.length > 1 && (
                        <div className="absolute bottom-6 right-8 text-xs font-bold uppercase tracking-widest text-foreground/50 flex items-center gap-2">
                          Clique para passar <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Indicadores de página */}
              {paragraphs.length > 1 && (
                <div className="flex gap-2 justify-center mt-12 md:mt-16">
                  {paragraphs.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { stopAutoplay(); setActiveCard(i); }}
                      className={`h-2 rounded-full transition-all duration-300 ${i === activeCard ? 'w-8 bg-primary' : 'w-2 bg-primary/20 hover:bg-primary/40'}`}
                      aria-label={`Página ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Abordagens — título alinhado ao conteúdo; faixas em LARGURA TOTAL da seção (fora do container) */}
      {approaches && approaches.length > 0 && (
        <div className="relative z-10 mt-12">
          <div className="container mx-auto px-4 md:px-8 pt-10 border-t border-border/50">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5 flex items-center justify-center gap-2">
              <Award className="w-4 h-4" />
              Abordagens e Especialidades
            </h3>
          </div>
          {/* Versão estática (aparece só com prefers-reduced-motion) — abordagens originais, sem repetir */}
          <div className="marquee-static container mx-auto px-4 md:px-8 flex-wrap justify-center gap-2.5">
            {(approaches ?? []).map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-foreground"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {a}
              </span>
            ))}
          </div>

          {/* Faixas animadas, full-width, em sentidos opostos; pausam no hover (escondidas com reduced-motion) */}
          <div className="marquee-animated space-y-3">
            {[
              { row: marqueeRow1, dir: "marquee-rtl" },
              { row: marqueeRow2, dir: "marquee-ltr" },
            ].map(({ row, dir }, ri) => (
              <div key={ri} className="marquee-row relative overflow-hidden">
                <div className={`marquee-track flex gap-2.5 ${dir}`}>
                  {[...row, ...row].map((a, idx) => (
                    <span
                      key={idx}
                      aria-hidden={idx >= row.length}
                      className="inline-flex flex-none items-center gap-1.5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-foreground"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {a}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
