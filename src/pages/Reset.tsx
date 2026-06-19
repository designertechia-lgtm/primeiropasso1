import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";

export default function Reset() {
  const [status, setStatus] = useState<"running" | "done">("running");

  useEffect(() => {
    (async () => {
      try {
        localStorage.clear();
      } catch (err) {
        console.warn("[Reset] localStorage.clear falhou", err);
      }
      try {
        sessionStorage.clear();
      } catch (err) {
        console.warn("[Reset] sessionStorage.clear falhou", err);
      }
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch (err) {
        console.warn("[Reset] unregister service worker falhou", err);
      }
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch (err) {
        console.warn("[Reset] caches.delete falhou", err);
      }

      setStatus("done");
      window.setTimeout(() => {
        window.location.replace("/");
      }, 800);
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center space-y-4 max-w-md">
        <div className="flex justify-center">
          <Leaf className="h-12 w-12 text-primary" />
        </div>
        <h1 className="font-heading text-2xl text-foreground">
          {status === "running" ? "Limpando dados do navegador…" : "Pronto! Redirecionando…"}
        </h1>
        <p className="text-muted-foreground">
          {status === "running"
            ? "Estamos resetando o cache local. Em alguns segundos a página vai abrir novamente."
            : "Você será levado para a página inicial."}
        </p>
      </div>
    </div>
  );
}
