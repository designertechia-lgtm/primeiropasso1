import { useEffect } from "react";
import { useProfessional } from "@/hooks/useProfessional";

export default function FaviconUpdater() {
  const { data: professional } = useProfessional();

  useEffect(() => {
    if (!professional?.logo_url) return;

    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = `${professional.logo_url}?t=${Date.now()}`;

    if (professional.full_name) {
      document.title = professional.full_name;
    }
  }, [professional?.logo_url, professional?.full_name]);

  return null;
}
