import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";
import AxelChat from "./AxelChat";

export default function AdminChatFloat() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // Esconde o float button quando já está na página dedicada do Axel Chat
  const isOnChatPage = location.pathname === "/admin/chat";

  if (isOnChatPage) return null;

  return (
    <>
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform bg-gradient-to-br from-purple-500 to-blue-500 text-white z-50 p-0"

      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Sparkles className="h-6 w-6" />
        )}
        <span className="sr-only">Axel</span>
      </Button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-200">

          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Axel
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <AxelChat />
          </div>
        </div>
      )}
    </>
  );
}