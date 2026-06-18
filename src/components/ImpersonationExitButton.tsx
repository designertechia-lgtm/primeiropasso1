// Botão discreto (canto inferior esquerdo) que aparece SOMENTE enquanto o
// super-admin está logado como outro usuário. Substitui o banner: sinaliza o
// modo e permite voltar à conta própria em 1 clique.
import { useImpersonation } from "@/hooks/useImpersonation";
import { LogOut, Loader2 } from "lucide-react";

export default function ImpersonationExitButton() {
  const { isImpersonating, target, isBusy, exitImpersonation } = useImpersonation();

  if (!isImpersonating) return null;

  const firstName = target?.targetName?.split(" ")[0] ?? "usuário";

  return (
    <button
      onClick={exitImpersonation}
      disabled={isBusy}
      title={`Você está no painel de ${target?.targetName ?? target?.targetEmail}. Clique para voltar à sua conta.`}
      className="fixed bottom-4 left-4 z-[60] flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-700 shadow-lg backdrop-blur-md transition-colors hover:bg-amber-500/25 disabled:opacity-60 dark:text-amber-300"
    >
      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
      <span>Sair do painel de {firstName}</span>
    </button>
  );
}
