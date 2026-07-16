// Trava o vazamento do profissional de demonstração.
//
// O Hero tinha `crp || DEMO_PROFESSIONAL.crp` (e o mesmo para foto, nome, título e subtítulo).
// Quem não tinha conselho exibia o CRP da psicóloga fictícia "Dra. Marina Oliveira" na landing
// pública — 9 dos 17 profissionais, incluindo uma padaria. Estes testes falham se o fallback
// voltar em qualquer um dos cinco campos.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HeroSection from "./HeroSection";

// Valores reais do DEMO_PROFESSIONAL (src/data/demoProfessional.ts) — o que NUNCA pode vazar.
const MARINA = {
  nome: "Dra. Marina Oliveira",
  crp: "06/123456",
  titulo: "Dê o primeiro passo para uma mente equilibrada",
  subtitulo: "Atendimento online humanizado e acolhedor para você cuidar da sua saúde mental",
  foto: "images.unsplash.com",
};

// O caso real: DesignerTech, empresa de tecnologia, sem conselho.
const semConselho = {
  professionalName: "DesignerTech",
  crp: "",
  title: "Crie, lance e cresça seu produto digital feito sob medida.",
  subtitle: "Organize sua agenda, crie conteúdo e gerencie sua plataforma em um só lugar.",
  photoUrl: "https://exemplo.test/foto-real.jpg",
  whatsapp: "5548988238190",
};

const renderHero = (props: Record<string, unknown>) =>
  render(
    <MemoryRouter>
      <HeroSection {...(props as any)} />
    </MemoryRouter>,
  );

describe("HeroSection — não vaza o profissional de demonstração", () => {
  it("CRP vazio não exibe o registro da psicóloga fictícia", () => {
    renderHero(semConselho);
    expect(screen.queryByText(MARINA.crp)).toBeNull();
  });

  it("CRP vazio não deixa nenhum resquício de número de conselho na tela", () => {
    const { container } = renderHero(semConselho);
    // Qualquer coisa no formato NN/NNNNNN sob o nome seria um registro indevido.
    expect(container.textContent).not.toMatch(/\d{2}\/\d{5,6}/);
  });

  it("CRP preenchido continua aparecendo (não quebrei quem tem conselho)", () => {
    renderHero({ ...semConselho, professionalName: "Daiane Cenci", crp: "CRP 12/34567" });
    expect(screen.getByText("CRP 12/34567")).toBeInTheDocument();
  });

  it("subtítulo vazio não exibe o texto de saúde mental da demo", () => {
    renderHero({ ...semConselho, subtitle: "" });
    expect(screen.queryByText(MARINA.subtitulo)).toBeNull();
  });

  it("título vazio não exibe a headline da demo", () => {
    renderHero({ ...semConselho, title: "" });
    expect(screen.queryByText(MARINA.titulo)).toBeNull();
  });

  it("sem foto, mostra o placeholder — nunca o rosto da pessoa da demo", () => {
    const { container } = renderHero({ ...semConselho, photoUrl: "", heroImageUrl: "" });
    const imgs = Array.from(container.querySelectorAll("img"));
    expect(imgs.some((i) => i.getAttribute("src")?.includes(MARINA.foto))).toBe(false);
    expect(screen.getByText("Foto do profissional")).toBeInTheDocument();
  });

  it("nome vazio não vira o nome da psicóloga fictícia", () => {
    renderHero({ ...semConselho, professionalName: "" });
    expect(screen.queryByText(MARINA.nome)).toBeNull();
  });

  it("o texto real do profissional continua sendo exibido", () => {
    renderHero(semConselho);
    expect(screen.getByText("DesignerTech")).toBeInTheDocument();
    expect(screen.getByText(semConselho.title)).toBeInTheDocument();
  });
});
