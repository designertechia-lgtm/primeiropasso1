// ⚠️ NÃO USE COMO FALLBACK DE LANDING REAL. Arquivo órfão desde 15/07/2026 — nada importa daqui.
//
// Isto é uma psicóloga FICTÍCIA. O HeroSection usava estes valores para preencher campo vazio
// (`crp || DEMO_PROFESSIONAL.crp` etc.) e o resultado foi dado falso em página pública: 9 dos 17
// profissionais exibiam o CRP "06/123456" dela, 5 exibiam a foto (uma pessoa do Unsplash) como se
// fosse a própria, e uma padaria anunciava "cuidar da sua saúde mental". Campo vazio deve ficar
// vazio — o JSX do Hero já esconde cada um.
//
// `src/components/landing/HeroSection.test.tsx` falha se este fallback voltar ao Hero.
// Se for reaproveitar isto (ex.: uma página /demo de verdade), passe os valores como props
// explícitas dessa página — nunca como fallback dentro de um componente que também serve
// profissional real.
export const DEMO_PROFESSIONAL = {
  slug: "demo",
  full_name: "Dra. Marina Oliveira",
  crp: "06/123456",
  bio: "Psicóloga clínica com mais de 10 anos de experiência em atendimento individual e de casais. Graduada pela Universidade de São Paulo (USP) com pós-graduação em Terapia Cognitivo-Comportamental pelo Instituto de Psiquiatria do HC-FMUSP. Minha abordagem é integrativa, combinando técnicas baseadas em evidências científicas com um olhar humanizado e acolhedor. Trabalho especialmente com questões relacionadas à ansiedade, depressão, autoestima, relacionamentos e desenvolvimento pessoal. Acredito que cada pessoa possui recursos internos para transformar sua vida — e meu papel é ajudá-la a descobri-los e fortalecê-los.",
  approaches: [
    "Terapia Cognitivo-Comportamental (TCC)",
    "Terapia de Aceitação e Compromisso (ACT)",
    "Mindfulness",
    "Psicologia Positiva",
  ],
  hero_title: "Dê o primeiro passo para uma mente equilibrada",
  hero_subtitle: "Atendimento online humanizado e acolhedor para você cuidar da sua saúde mental",
  photo_url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&crop=face",
  hero_image_url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200&h=600&fit=crop",
  about_title: "Um pouquinho sobre minha jornada",
  about_image_url: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&h=800&fit=crop",
  about_video_url: "https://www.youtube.com/watch?v=LXb3EKWsInQ",
  primary_color: "#87A96B",
  secondary_color: "#C4A882",
  background_color: "#F5F0EB",
  whatsapp: "5511999999999",
};
