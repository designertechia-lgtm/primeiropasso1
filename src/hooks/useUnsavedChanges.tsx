import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Guarda global de "alterações não salvas".
 *
 * O app usa `<BrowserRouter>` (não data router), então `useBlocker` do React
 * Router não está disponível. Em vez disso interceptamos a navegação nos pontos
 * de saída (NavLink da barra lateral, botão "Sair") e protegemos o fechar/
 * recarregar (beforeunload) e o botão "voltar" do navegador (popstate).
 *
 * Como usar numa página de edição:
 *   const isDirty = snapshotAtual !== snapshotSalvo;
 *   useUnsavedChanges(isDirty, handleSave); // handleSave deve retornar boolean
 */

/** Retorna true se salvou com sucesso (libera a saída); false mantém na página. */
type SaveFn = () => Promise<boolean>;

interface UnsavedChangesContextValue {
  /** A página de edição registra se há alterações pendentes e como salvá-las. */
  setGuard: (isDirty: boolean, onSave: SaveFn) => void;
  /** A página remove o registro ao desmontar. */
  clearGuard: () => void;
  /** Pontos de navegação chamam isto: se houver alteração pendente abre o popup, senão segue direto. */
  confirmNavigation: (proceed: () => void) => void;
  /** Indica se há alteração pendente (para os pontos de navegação decidirem se interceptam). */
  isDirty: boolean;
}

const noop = () => {};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  setGuard: noop,
  clearGuard: noop,
  confirmNavigation: (proceed) => proceed(),
  isDirty: false,
});

/** Usado por NavLink, botão "Sair" e quaisquer outros pontos de saída. */
export function useUnsavedChangesGuard() {
  return useContext(UnsavedChangesContext);
}

/**
 * Usado pelas PÁGINAS de edição. Informa ao guarda global se há alterações não
 * salvas e como salvá-las. `onSave` deve retornar `true` quando salvar com
 * sucesso (aí a saída é liberada) e `false`/lançar quando falhar.
 */
export function useUnsavedChanges(isDirty: boolean, onSave: SaveFn) {
  const { setGuard, clearGuard } = useContext(UnsavedChangesContext);
  // Sem array de deps: roda a cada render para manter sempre a closure mais
  // recente de `onSave` e o valor atual de `isDirty`. O provider faz bail-out
  // quando o booleano não muda, então não há re-render desnecessário.
  useEffect(() => {
    setGuard(isDirty, onSave);
  });
  // Ao trocar de página, limpa o registro.
  useEffect(() => clearGuard, [clearGuard]);
}

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const dirtyRef = useRef(false);
  const saveRef = useRef<SaveFn>(async () => true);
  const [isDirty, setIsDirty] = useState(false);

  // Controla a "trava" (entrada-sentinela) do histórico para o botão "voltar".
  // Mantemos no máximo UMA sentinela ativa enquanto a mesma página estiver sendo
  // editada, mesmo que ela alterne entre limpa e suja (editar → salvar → editar).
  const sentinelActiveRef = useRef(false);

  // Ação a executar se o usuário confirmar a saída.
  const pendingRef = useRef<(() => void) | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savingExit, setSavingExit] = useState(false);

  const setGuard = useCallback((nextDirty: boolean, onSave: SaveFn) => {
    dirtyRef.current = nextDirty;
    saveRef.current = onSave;
    setIsDirty((prev) => (prev === nextDirty ? prev : nextDirty));
  }, []);

  const clearGuard = useCallback(() => {
    dirtyRef.current = false;
    saveRef.current = async () => true;
    sentinelActiveRef.current = false; // página desmontou — esquece a trava
    setIsDirty(false);
  }, []);

  const confirmNavigation = useCallback((proceed: () => void) => {
    if (!dirtyRef.current) {
      proceed();
      return;
    }
    pendingRef.current = proceed;
    setDialogOpen(true);
  }, []);

  const closeAndStay = useCallback(() => {
    pendingRef.current = null;
    setDialogOpen(false);
  }, []);

  const runPending = useCallback(() => {
    const proceed = pendingRef.current;
    pendingRef.current = null;
    dirtyRef.current = false;
    sentinelActiveRef.current = false; // saída confirmada — esquece a trava
    setIsDirty(false);
    setDialogOpen(false);
    proceed?.();
  }, []);

  const handleSaveAndExit = useCallback(async () => {
    setSavingExit(true);
    let ok = false;
    try {
      ok = await saveRef.current();
    } catch {
      ok = false;
    }
    setSavingExit(false);
    if (ok) runPending();
    // Se falhou, mantém o popup aberto; a página já mostra o toast de erro.
  }, [runPending]);

  // --- Camada 1: fechar aba / recarregar (F5) / fechar navegador ---
  // Aviso nativo do navegador (o visual desse não é customizável — é proteção do browser).
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // --- Camada 2: botão "voltar" do navegador ---
  // Sem data router não há useBlocker. Empilhamos uma entrada-sentinela no
  // histórico; o "voltar" cai nela, nós a recolocamos (cancelando a saída) e
  // abrimos o popup. Ao confirmar, voltamos 2 entradas (a sentinela + a própria
  // página) até o destino real.
  useEffect(() => {
    if (!isDirty) return;
    // Empilha a trava só se ainda não houver uma ativa (evita acumular entradas
    // ao alternar editar → salvar → editar na mesma página).
    if (!sentinelActiveRef.current) {
      window.history.pushState(null, "", window.location.href);
      sentinelActiveRef.current = true;
    }

    const onPopState = () => {
      if (!dirtyRef.current) return; // saída já confirmada — deixa passar
      window.history.pushState(null, "", window.location.href);
      sentinelActiveRef.current = true;
      pendingRef.current = () => window.history.go(-2);
      setDialogOpen(true);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isDirty]);

  return (
    <UnsavedChangesContext.Provider value={{ setGuard, clearGuard, confirmNavigation, isDirty }}>
      {children}

      <AlertDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open && !savingExit) closeAndStay();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              Você editou esta página e ainda não salvou. Se sair agora, as alterações serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={closeAndStay} disabled={savingExit}>
              Continuar editando
            </Button>
            <Button
              variant="outline"
              onClick={runPending}
              disabled={savingExit}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              Descartar e sair
            </Button>
            <Button onClick={handleSaveAndExit} disabled={savingExit}>
              {savingExit ? "Salvando..." : "Salvar e sair"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UnsavedChangesContext.Provider>
  );
}
