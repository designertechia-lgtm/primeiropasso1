import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    // O app era um único arquivo de ~3,2 MB. Minificar isso de uma vez é o
    // pico de memória do build inteiro — e é exatamente onde o build do
    // servidor parava (o log terminava logo depois de "modules transformed",
    // sem erro, que é como um processo morto por falta de memória aparece).
    // Quebrar em pedaços derruba esse pico e ainda faz o navegador baixar só
    // o que a tela usa.
    //
    // Os grupos são por biblioteca, não por tela: assim um pedaço só é
    // reconstruído (e rebaixado pelo usuário) quando aquela lib muda.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/react-dom/") || id.includes("/react/") || id.includes("/scheduler/")) return "react";
          if (id.includes("/@fullcalendar/")) return "calendario";
          if (id.includes("/recharts/") || id.includes("/d3-") || id.includes("/victory-")) return "graficos";
          if (id.includes("/@supabase/")) return "supabase";
          if (id.includes("/@radix-ui/")) return "radix";
          if (id.includes("/lucide-react/")) return "icones";
          if (id.includes("/html2canvas/")) return "html2canvas";
          return "vendor";
        },
      },
    },
    // O aviso padrão (500 kB) dispara em pedaços que já são aceitáveis depois
    // do split; 900 kB mantém o alerta útil sem virar ruído em todo build.
    chunkSizeWarningLimit: 900,
  },
});
