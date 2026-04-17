import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function FaviconUpdater() {
  const { data } = useQuery({
    queryKey: ["favicon-professional"],
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("logo_url, name")
        .not("logo_url", "is", null)
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 1000 * 60 * 10,
  });

  useEffect(() => {
    if (!data?.logo_url) return;

    let link = document.querySelector("link[rel='icon']") as HTMLLinkElement;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = data.logo_url;

    if (data.name) {
      document.title = data.name;
    }
  }, [data]);

  return null;
}
