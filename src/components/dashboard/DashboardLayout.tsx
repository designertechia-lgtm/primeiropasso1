import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { DashboardSidebar } from "./DashboardSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useProfessional } from "@/hooks/useProfessional";
import { useState, useEffect, useMemo } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildProfessionalThemeVars } from "@/lib/utils";

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
      <div className="min-h-screen flex w-full" style={themeVars as React.CSSProperties}>
        <DashboardSidebar />
        <div className="flex-1 flex flex-col min-w-0">
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
      </div>
    </SidebarProvider>
  );
}
