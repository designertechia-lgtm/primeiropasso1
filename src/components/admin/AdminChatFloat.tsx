import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import AxelChat from "./AxelChat";

export default function AdminChatFloat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const location = useLocation();

  // Esconde o float button quando já está na página dedicada do Axel Chat
  const isOnChatPage = location.pathname === "/admin/chat";

  // ESC sai da tela cheia; trava o scroll do body enquanto expandido
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreen]);

  function closeChat() {
    setIsOpen(false);
    setIsFullscreen(false);
  }

  if (isOnChatPage) return null;

  return (
    <>
      {/* FAB — escondido em tela cheia (o painel tem seus próprios controles) */}
      {!isFullscreen && (
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform bg-gradient-to-br from-purple-500 to-blue-500 text-white z-50 p-0"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
          <span className="sr-only">Axel</span>
        </Button>
      )}

      {isOpen && (
        <>
          {/* Backdrop só em tela cheia — não contém o AxelChat, pode montar/desmontar à vontade */}
          {isFullscreen && (
            <div
              className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
              onClick={() => setIsFullscreen(false)}
            />
          )}

          {/* Painel — MESMO elemento nos dois modos (só muda a className) pra preservar a conversa */}
          <div
            className={
              isFullscreen
                ? "fixed inset-0 z-50 my-4 mx-4 sm:my-8 sm:mx-16 lg:mx-32 xl:mx-48 bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                : "fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200"
            }
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Axel
              </h3>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setIsFullscreen((v) => !v)}
                  title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                  aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                >
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={closeChat}
                  title="Fechar"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <AxelChat />
            </div>
          </div>
        </>
      )}
    </>
  );
}
