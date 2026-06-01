import PlatformHeader from "@/components/platform-landing/PlatformHeader";
import PlatformHero from "@/components/platform-landing/PlatformHero";
import PlatformLogoBar from "@/components/platform-landing/PlatformLogoBar";
import PlatformPain from "@/components/platform-landing/PlatformPain";
import PlatformSolution from "@/components/platform-landing/PlatformSolution";
import PlatformAIShowcase from "@/components/platform-landing/PlatformAIShowcase";
import PlatformHowItWorks from "@/components/platform-landing/PlatformHowItWorks";
import PlatformFeatureGrid from "@/components/platform-landing/PlatformFeatureGrid";
import PlatformTestimonials from "@/components/platform-landing/PlatformTestimonials";
import PlatformPricing from "@/components/platform-landing/PlatformPricing";
import PlatformFAQ from "@/components/platform-landing/PlatformFAQ";
import PlatformCTA from "@/components/platform-landing/PlatformCTA";
import PlatformFooter from "@/components/platform-landing/PlatformFooter";
import Reveal from "@/components/platform-landing/Reveal";

export default function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <PlatformHeader />
      <main>
        {/* Hero fica sem Reveal: é a primeira dobra, já visível no load. */}
        <PlatformHero />
        <PlatformLogoBar />
        <Reveal as="section"><PlatformPain /></Reveal>
        <Reveal as="section"><PlatformSolution /></Reveal>
        <Reveal as="section"><PlatformAIShowcase /></Reveal>
        <Reveal as="section"><PlatformHowItWorks /></Reveal>
        <Reveal as="section"><PlatformFeatureGrid /></Reveal>
        <Reveal as="section"><PlatformTestimonials /></Reveal>
        <Reveal as="section"><PlatformPricing /></Reveal>
        <Reveal as="section"><PlatformFAQ /></Reveal>
        <Reveal as="section"><PlatformCTA /></Reveal>
      </main>
      <PlatformFooter />
    </div>
  );
}
