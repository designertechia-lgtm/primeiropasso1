import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "./DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useProfessional } from "@/hooks/useProfessional";
import { useState, useEffect, useMemo } from "react";
import { Moon, Sun, AlertTriangle, XCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildProfessionalThemeVars } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useSubscription, useCreditBalance } from "@/hooks/useBilling";
import { differenceInDays, parseISO } from "date-fns";
import AdminChatFloat from "@/components/admin/AdminChatFloat";

const LOW_CREDIT_THRESHOLD = 10;

function BillingBanner() {
  const { data: sub } = useSubscription();
  const { data: bal } = useCreditBalance();

  const daysLeft = sub?.current_period_end
    ? differenceInDays(parseISO(sub.current_period_end), new Date())
    : null;

  const noSubscription = !sub;
  const isExpired = daysLeft !== null && daysLeft < 0;
  const isExpiring = daysLeft !== null && daysLeft >= 0 && daysLeft <= 5;
  const lowCredits = (bal?.balance ?? 0) < LOW_CREDIT_THRESHOLD;

  if (!noSubscription && !isExpired && !isExpiring && !lowCredits) return null;

  const banners: Array<{ bg: string; icon: React.ReactNode; text: string }> = [];

  if (noSubscription) {
    banners.push({
      bg: "bg-red-600 text-white",
      icon: <XCircle className="h-4 w-4 shrink-0" />,
      text: "Você ainda não possui assinatura ativa. Assine via PIX para liberar todos os recursos.",
    });
  } else if (isExpired) {
    banners.push({
      bg: "bg-red-600 text-white",
      icon: <XCircle className="h-4 w-4 shrink-0" />,
      text: "Sua assinatura está vencida. Renove via PIX para continuar usando a plataforma.",
    });
  } else if (isExpiring) {
    banners.push({
      bg: "bg-yellow-500 text-white",
      icon: <AlertTriangle className="h-4 w-4 shrink-0" />,
      text: `Sua assinatura vence em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}. Renove para não perder acesso.`,
    });
  }

  if (lowCredits) {
    banners.push({
      bg: "bg-amber-500 text-white",
      icon: <Zap className="h-4 w-4 shrink-0" />,
      text: `Saldo de créditos baixo (${bal?.balance ?? 0}). Recarregue para continuar usando IA avançada.`,
    });
  }

  return (
    <>
      {banners.map((b, i) => (
        <div key={i} className={`${b.bg} px-4 py-2 text-sm flex items-center justify-center gap-2`}>
          {b.icon}
          <span>{b.text}</span>
          <Link to="/admin/assinatura" className="underline font-semibold ml-1 whitespace-nowrap">
            Gerenciar →
          </Link>
        </div>
      ))}
    </>
  );
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();
  const { data: professional } = useProfessional();
  const darkModeEnabled = (professional as any)?.dark_mode ?? false;

  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("admin_dark_mode");
    if (stored !== null) return stored === "1";
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("admin_dark_mode", dark ? "1" : "0");
    return () => {
      // Ao desmontar (saindo do admin), remove o .dark global pra não vazar pra paciente/site público
      document.documentElement.classList.remove("dark");
    };
  }, [dark]);

  const themeVars = useMemo(
    () => buildProfessionalThemeVars({
      primary_color:       (professional as any)?.primary_color,
      // Não injetamos background no admin — fica neutro e o dark mode funciona corretamente.
      font_family:         (professional as any)?.font_family,
      heading_font_family: (professional as any)?.heading_font_family,
      skipBackground:      true,
    }),
    [professional]
  );

  return (
    <SidebarProvider>
      <div className="theme-admin min-h-screen flex w-full" style={themeVars as React.CSSProperties}>
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <BillingBanner />
          <header className="h-14 flex items-center justify-between border-b px-4 bg-card">
            <SidebarTrigger className="ml-0" />
            <div className="flex items-center gap-3">
              {darkModeEnabled && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDark(!dark)}
                  className="h-8 w-8"
                >
                  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              )}
              <span className="text-sm text-muted-foreground">
                {profile?.full_name || "Profissional"}
              </span>
              <button
                onClick={signOut}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sair
              </button>
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
            {children}
          </main>
        </div>
        <AdminChatFloat />
      </div>
    </SidebarProvider>
  );
}
