import { forwardRef } from "react";

const FONT_CLASS_MAP: Record<string, string> = {
  "serif-italic":  "font-serif italic font-medium tracking-tight",
  "serif-bold":    "font-serif font-black uppercase tracking-tighter",
  "sans-bold":     "font-sans font-black tracking-tight",
  "serif-elegant": "font-serif font-semibold italic tracking-normal",
};

const FONT_SIZE_PX: Record<string, number> = {
  sm: 60,
  md: 84,
  lg: 110,
};

export interface CarouselItem {
  image_url?: string;
  caption?: string;
}

export interface SlideArticle {
  title: string;
  cover_image_url?: string | null;
  font_style?: string | null;
  font_size?: string | null;
  carousel_items?: CarouselItem[] | null;
}

export interface SlideProfessional {
  full_name?: string | null;
  whatsapp?: string | null;
  contact_title?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  slug?: string | null;
}

interface SlideProps {
  imageUrl?: string | null;
  caption?: string;
  fontClass: string;
  fontSizePx: number;
}

const ContentSlide = forwardRef<HTMLDivElement, SlideProps>(({ imageUrl, caption, fontClass, fontSizePx }, ref) => (
  <div
    ref={ref}
    style={{
      width: 1080,
      height: 1080,
      position: "relative",
      overflow: "hidden",
      backgroundColor: "#1a1a1a",
    }}
  >
    {imageUrl && (
      <>
        <img
          src={imageUrl}
          alt=""
          crossOrigin="anonymous"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.10)" }} />
      </>
    )}
    {caption && (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 80,
          textAlign: "center",
        }}
      >
        <p
          className={fontClass}
          style={{
            color: "white",
            fontWeight: 800,
            fontSize: fontSizePx,
            lineHeight: 1.1,
            margin: 0,
            textShadow: "0 4px 15px rgba(0,0,0,1), 0 2px 6px rgba(0,0,0,0.8)",
          }}
        >
          {caption}
        </p>
      </div>
    )}
  </div>
));
ContentSlide.displayName = "ContentSlide";

interface ContactSlideProps {
  professional: SlideProfessional;
}

const ContactSlide = forwardRef<HTMLDivElement, ContactSlideProps>(({ professional }, ref) => {
  const primary = professional.primary_color || "#9b87f5";
  const contactTitle = professional.contact_title || "Dê o primeiro passo.\nAgende sua conversa.";
  const slug = professional.slug ?? "";

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        height: 1080,
        position: "relative",
        overflow: "hidden",
        background: "radial-gradient(ellipse at top, #1a2e1a, #0a120a)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 48,
        padding: 80,
        textAlign: "center",
      }}
    >
      <p
        className="font-serif"
        style={{
          color: "white",
          fontWeight: 800,
          fontSize: 80,
          lineHeight: 1.1,
          margin: 0,
          whiteSpace: "pre-line",
          textShadow: "0 4px 15px rgba(0,0,0,0.6)",
        }}
      >
        {contactTitle}
      </p>

      <div style={{ height: 6, width: 80, borderRadius: 999, background: primary }} />

      {professional.full_name && (
        <p
          style={{
            color: "rgba(255,255,255,0.85)",
            fontSize: 36,
            fontWeight: 500,
            margin: 0,
            letterSpacing: "0.02em",
          }}
        >
          {professional.full_name}
        </p>
      )}

      {professional.whatsapp && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 16,
            padding: "20px 48px",
            borderRadius: 999,
            color: "white",
            fontWeight: 700,
            fontSize: 36,
            background: "#25D366",
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.856L.063 23.25a.75.75 0 00.916.916l5.395-1.469A11.953 11.953 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.667-.5-5.201-1.375l-.373-.215-3.864 1.052 1.052-3.864-.215-.373A9.953 9.953 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
          </svg>
          {professional.whatsapp}
        </div>
      )}

      {slug && (
        <div
          style={{
            padding: "16px 36px",
            borderRadius: 999,
            border: "2px solid rgba(255,255,255,0.3)",
            color: "rgba(255,255,255,0.9)",
            fontWeight: 500,
            fontSize: 28,
            background: "rgba(255,255,255,0.06)",
          }}
        >
          primeiropasso.online/{slug}
        </div>
      )}
    </div>
  );
});
ContactSlide.displayName = "ContactSlide";

interface ArticleSlidesProps {
  article: SlideArticle;
  professional: SlideProfessional;
  slideRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
}

/**
 * Renders all article slides (cover-as-content + carousel items + contact slide) at fixed 1080x1080.
 * Used hidden off-screen for html2canvas capture.
 */
export default function ArticleSlides({ article, professional, slideRefs }: ArticleSlidesProps) {
  const items: CarouselItem[] = Array.isArray(article.carousel_items) ? article.carousel_items : [];
  const fontClass = FONT_CLASS_MAP[article.font_style ?? ""] ?? FONT_CLASS_MAP["serif-italic"];
  const fontSize = FONT_SIZE_PX[article.font_size ?? ""] ?? FONT_SIZE_PX.md;

  // Slide 1: cover with title
  const coverSlide = {
    image_url: article.cover_image_url ?? "",
    caption:   article.title,
  };

  const allSlides = [coverSlide, ...items];

  return (
    <>
      {allSlides.map((item, i) => (
        <ContentSlide
          key={i}
          ref={(el) => { slideRefs.current[i] = el; }}
          imageUrl={item.image_url || null}
          caption={item.caption}
          fontClass={fontClass}
          fontSizePx={fontSize}
        />
      ))}
      <ContactSlide
        ref={(el) => { slideRefs.current[allSlides.length] = el; }}
        professional={professional}
      />
    </>
  );
}

export function getSlideCount(article: SlideArticle): number {
  const items = Array.isArray(article.carousel_items) ? article.carousel_items : [];
  return 1 + items.length + 1; // cover + items + contact
}
