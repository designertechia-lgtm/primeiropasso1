/**
 * Smoke da página do Editor: monta a tela de verdade (sem vídeo carregado e com
 * um projeto restaurado do localStorage) e prova que a mesa de edição aparece
 * inteira — as 8 abas, a timeline e o rodapé de render.
 *
 * Existe porque o build e o typecheck NÃO pegam erro de montagem (ordem de
 * hooks, variável usada antes de existir): a reforma de layout de 03/08 moveu
 * blocos grandes de JSX, e um deles fora de lugar só apareceria na tela da
 * Daiane.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import AdminEditorVideo from "./AdminEditorVideo";
import { EDITOR_STORAGE_KEY } from "./editor/types";

vi.mock("@/hooks/useProfessional", () => ({
  useProfessional: () => ({ data: { id: 1, logo_url: "" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));
vi.mock("@/lib/videoApi", () => ({ videoApiAuthHeaders: async () => ({}) }));

const META = {
  edit_id: "abc123", duration: 30, width: 1080, height: 1920,
  has_audio: true, thumbs: [] as string[],
};

const projetoSalvo = {
  v: 2, meta: META, sourceLabel: "aula.mp4", sourceUrl: "", resultUrl: "",
  renderJobId: "", stickerJob: null, projectId: null, projectName: "Aula",
  doc: {
    segments: [{ id: 1, start: 0, end: 30, keep: true }],
    seqClips: [
      { id: "s1", edit_id: "vidB", name: "encerramento", natural_dur: 8,
        source_url: "", src_in: 0, src_out: 8 },
    ],
  },
};

const montar = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AdminEditorVideo /></MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("pp-editor-onboarding-visto", "1");   // sem tour por cima
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ thumbs: [], musicas: [], fontes: [] }),
  }));
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true, value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true, value: vi.fn(),
  });
  // APIs de navegador que o jsdom não traz (o editor carrega as fontes das
  // legendas e observa o tamanho do player)
  vi.stubGlobal("FontFace", class {
    load() { return Promise.resolve(this); }
  });
  (document as any).fonts = { add: vi.fn(), delete: vi.fn(), check: () => true };
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {}
  });
});
afterEach(() => { localStorage.clear(); });

describe("Editor de Vídeo — mesa de edição", () => {
  it("sem vídeo: mostra a biblioteca como porta de entrada", async () => {
    montar();
    expect(await screen.findByText("Editor de Vídeo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Biblioteca e projetos/ })).toBeInTheDocument();
    expect(screen.getByText(/Enviar vídeo do computador/)).toBeInTheDocument();
    // a mesa só aparece com um vídeo aberto
    expect(screen.queryByRole("tab", { name: "Cortes" })).not.toBeInTheDocument();
  });

  // 20s (o padrão do vitest é 5): este caso monta a PÁGINA INTEIRA no jsdom —
  // player, 8 abas, timeline, diálogos — e, quando roda junto com a suíte toda
  // em paralelo, passa dos 5s numa máquina modesta. Isolado leva ~2s.
  it("com projeto restaurado: player, 8 abas, timeline e render na tela", async () => {
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(projetoSalvo));
    montar();

    // as 8 ferramentas viraram abas ao lado do player
    for (const nome of ["Cortes", "Vídeos", "Legendas", "Textos", "Stickers",
                        "Trilha", "Áudio", "Acabamento"]) {
      expect(await screen.findByRole("tab", { name: nome })).toBeInTheDocument();
    }
    // aba inicial = Cortes
    expect(screen.getByRole("tab", { name: "Cortes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Remover trecho:")).toBeInTheDocument();

    // timeline em largura total + atalhos que abrem as abas
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getByText("Adicionar:")).toBeInTheDocument();
    // rodapé de render (a duração final aparece na timeline e no rodapé)
    expect(screen.getByRole("button", { name: /Renderizar/ })).toBeInTheDocument();
    expect(screen.getAllByText(/duração final/).length).toBeGreaterThan(0);

    // Leva 4: o vídeo principal tem a MESMA tesoura dos outros clipes
    expect(screen.getByTitle(/Cortar \/ ajustar velocidade deste vídeo/)).toBeInTheDocument();
  }, 20000);

  it("o vídeo emendado aparece como BLOCO na trilha, com ✂ e lixeira", async () => {
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(projetoSalvo));
    montar();
    await waitFor(() =>
      expect(screen.getByTitle(/encerramento — 0:08.0 \(emendado 1º\)/)).toBeInTheDocument());
    expect(screen.getByTitle("Cortar este clipe antes de montar")).toBeInTheDocument();
    expect(screen.getByTitle("Remover este vídeo da sequência")).toBeInTheDocument();
    // e o 3º botão da fileira: a transição de entrada (pedido do Carlos)
    expect(screen.getByTitle(/Transição ao entrar neste clipe/)).toBeInTheDocument();
  }, 20000);

  it("a trilha tem o + no fim, que abre o diálogo de emendar vídeos", async () => {
    const { fireEvent } = await import("@testing-library/react");
    localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(projetoSalvo));
    montar();
    const mais = await screen.findByTitle(/Adicionar vídeos no FIM da trilha/);
    fireEvent.click(mais);
    expect(await screen.findByText("Emendar vídeos no fim")).toBeInTheDocument();
    expect(screen.getByText(/Enviar vídeos do computador/)).toBeInTheDocument();
  });
});
