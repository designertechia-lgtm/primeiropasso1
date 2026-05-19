import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Storage versioning: bump APP_STORAGE_VERSION sempre que mudar algo no
// formato dos dados persistidos (auth, profile, etc). Em qualquer mudança de
// versão, limpamos as chaves do Supabase para evitar tokens corrompidos travando
// o app. Preserva preferências do usuário (theme, etc) que não começam com "sb-".
const APP_STORAGE_VERSION = "2026.05.19.1";
const VERSION_KEY = "__pp_storage_version";

try {
  const current = localStorage.getItem(VERSION_KEY);
  if (current !== APP_STORAGE_VERSION) {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("sb-"))
      .forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(VERSION_KEY, APP_STORAGE_VERSION);
  }
} catch (err) {
  console.warn("[Boot] storage version check falhou", err);
}

createRoot(document.getElementById("root")!).render(<App />);
