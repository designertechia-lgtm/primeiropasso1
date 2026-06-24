import PlatformHeader from "@/components/platform-landing/PlatformHeader";
import PlatformHero from "@/components/platform-landing/PlatformHero";
import PlatformStats from "@/components/platform-landing/PlatformStats";
import PlatformLogoBar from "@/components/platform-landing/PlatformLogoBar";
import PlatformPain from "@/components/platform-landing/PlatformPain";
import PlatformSolution from "@/components/platform-landing/PlatformSolution";
import PlatformContentEngine from "@/components/platform-landing/PlatformContentEngine";
import PlatformAIShowcase from "@/components/platform-landing/PlatformAIShowcase";
import PlatformHowItWorks from "@/components/platform-landing/PlatformHowItWorks";
import PlatformContentHub from "@/components/platform-landing/PlatformContentHub";
import PlatformPricing from "@/components/platform-landing/PlatformPricing";
import PlatformFAQ from "@/components/platform-landing/PlatformFAQ";
import PlatformCTA from "@/components/platform-landing/PlatformCTA";
import PlatformFooter from "@/components/platform-landing/PlatformFooter";
import Reveal from "@/components/platform-landing/Reveal";

/**
 * Landing institucional do Primeiro Passo (redesign 2026).
 * Página pública estática — sem edição pelo painel gerente.
 * Paleta dedicada `pp-*` (terrosa/sálvia) + tipografia Playfair Display / Inter.
 *
 * Seções de fundo escuro (Hero/Stats/ContentEngine/Footer) ficam SEM <Reveal>
 * para a faixa colorida aparecer estável; as claras revelam suavemente no scroll.
 */
export default function Index() {
  return (
    <div className="pp-landing min-h-screen overflow-x-hidden bg-pp-bg font-inter text-pp-ink antialiased">
      <PlatformHeader />
      <main>
        {/* Hero: primeira dobra, já visível no load (sem Reveal). */}
        <PlatformHero />
        <PlatformStats />
        <Reveal as="div"><PlatformLogoBar /></Reveal>
        <Reveal as="div"><PlatformPain /></Reveal>
        <Reveal as="div"><PlatformSolution /></Reveal>
        <PlatformContentEngine />
        <Reveal as="div"><PlatformAIShowcase /></Reveal>
        <Reveal as="div"><PlatformHowItWorks /></Reveal>
        <Reveal as="div"><PlatformContentHub /></Reveal>
        <Reveal as="div"><PlatformPricing /></Reveal>
        <Reveal as="div"><PlatformFAQ /></Reveal>
        <Reveal as="div"><PlatformCTA /></Reveal>
      </main>
      <PlatformFooter />
    </div>
  );
}
