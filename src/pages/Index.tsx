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

export default function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <PlatformHeader />
      <main>
        <PlatformHero />
        <PlatformLogoBar />
        <PlatformPain />
        <PlatformSolution />
        <PlatformAIShowcase />
        <PlatformHowItWorks />
        <PlatformFeatureGrid />
        <PlatformTestimonials />
        <PlatformPricing />
        <PlatformFAQ />
        <PlatformCTA />
      </main>
      <PlatformFooter />
    </div>
  );
}
