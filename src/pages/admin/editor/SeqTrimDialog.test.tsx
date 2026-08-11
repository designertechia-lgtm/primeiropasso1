/**
 * Smoke do CORTADOR de clipe: monta o diálogo de verdade e prova o contrato que
 * o editor depende — dividir + tirar o miolo devolve DUAS janelas, e cancelar
 * não devolve nada. Uma conta errada aqui corta o vídeo montado no lugar errado.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SeqTrimDialog from "./SeqTrimDialog";
import type { SeqClip } from "./types";

vi.mock("@/lib/videoApi", () => ({ videoApiAuthHeaders: async () => ({}) }));

const CLIPE: SeqClip = {
  id: "c1", edit_id: "abc123", name: "take 2", natural_dur: 10,
  source_url: "", src_in: 0, src_out: 10,
};

beforeEach(() => {
  // sem worker no teste: a fita cai no placeholder e o corte segue funcionando
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("sem worker")));
  // jsdom não implementa play/pause
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true, value: vi.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true, value: vi.fn(),
  });
});

/** Simula o cursor na fita: a fita tem largura 0 no jsdom, então o clique é
 *  substituído pelo caminho equivalente — mover o tempo do <video>. */
const moverCursor = (t: number) => {
  const video = document.querySelector("video") as HTMLVideoElement;
  Object.defineProperty(video, "currentTime", { configurable: true, value: t });
  fireEvent.timeUpdate(video);
};

// 20s (o padrão do vitest é 5): estes casos montam o diálogo inteiro no jsdom —
// player, fita e o seletor com 28 cartões de transição — e passam dos 5s quando
// a suíte toda roda em paralelo nesta máquina. Isolados levam ~1s.
describe("SeqTrimDialog", { timeout: 20000 }, () => {
  it("abre com o clipe inteiro e conclui devolvendo a janela original", () => {
    const onConcluir = vi.fn();
    render(<SeqTrimDialog clip={CLIPE} onConcluir={onConcluir} onCancelar={vi.fn()} />);
    expect(screen.getByText(/Cortar "take 2"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Concluir/ }));
    // 1 parte só = não há emenda entre partes: a transição vai como "none"
    expect(onConcluir).toHaveBeenCalledWith(
      [{ src_in: 0, src_out: 10, speed: 1 }], "none", undefined, expect.any(Array));
  });

  it("dividir + tirar o miolo devolve DUAS partes", () => {
    const onConcluir = vi.fn();
    render(<SeqTrimDialog clip={CLIPE} onConcluir={onConcluir} onCancelar={vi.fn()} />);

    moverCursor(3);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));
    moverCursor(6);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));

    // dividir em 3 e em 6 dá [0,3] [3,6] [6,10]; leva o cursor ao MIOLO e o tira
    moverCursor(4.5);
    fireEvent.click(screen.getByRole("button", { name: /Tirar do clipe/ }));
    // (o texto do rodapé é quebrado por <b>, então casa pelo conteúdo do nó pai)
    expect(screen.getByText((_, el) => el?.textContent === "Vai ficar com 0:07.0 em 2 partes"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Concluir/ }));
    expect(onConcluir).toHaveBeenCalledWith(
      [{ src_in: 0, src_out: 3, speed: 1 }, { src_in: 6, src_out: 10, speed: 1 }],
      "none", undefined, expect.any(Array));
  });

  it("com 2+ partes dá para escolher a transição ENTRE ELAS", () => {
    const onConcluir = vi.fn();
    render(<SeqTrimDialog clip={CLIPE} onConcluir={onConcluir} onCancelar={vi.fn()} />);

    // com uma parte só, o seletor de emenda nem aparece (não há emenda)
    expect(screen.queryByText(/Entre as partes/)).not.toBeInTheDocument();

    moverCursor(3);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));
    moverCursor(6);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));
    moverCursor(4.5);
    fireEvent.click(screen.getByRole("button", { name: /Tirar do clipe/ }));

    // agora há 2 partes → o seletor aparece e abre
    fireEvent.click(screen.getByText(/Entre as partes/));
    fireEvent.click(screen.getByRole("button", { name: "Dissolver" }));
    fireEvent.click(screen.getByRole("button", { name: /Concluir/ }));
    expect(onConcluir).toHaveBeenCalledWith(
      [{ src_in: 0, src_out: 3, speed: 1 }, { src_in: 6, src_out: 10, speed: 1 }],
      "dissolve", undefined, expect.any(Array));
  });

  it("o aviso diz que a prévia NÃO toca a transição", () => {
    render(<SeqTrimDialog clip={CLIPE} onConcluir={vi.fn()} onCancelar={vi.fn()} />);
    moverCursor(3);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));
    moverCursor(6);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));
    moverCursor(4.5);
    fireEvent.click(screen.getByRole("button", { name: /Tirar do clipe/ }));
    fireEvent.click(screen.getByText(/Entre as partes/));
    expect(screen.getByText(/A prévia não toca a transição/)).toBeInTheDocument();
  });

  it("cancelar não devolve nada", () => {
    const onConcluir = vi.fn();
    const onCancelar = vi.fn();
    render(<SeqTrimDialog clip={CLIPE} onConcluir={onConcluir} onCancelar={onCancelar} />);
    moverCursor(4);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancelar$/ }));
    expect(onCancelar).toHaveBeenCalled();
    expect(onConcluir).not.toHaveBeenCalled();
  });

  it("reabrir uma PARTE mostra a janela dela, não a fonte inteira", () => {
    const onConcluir = vi.fn();
    render(<SeqTrimDialog clip={{ ...CLIPE, src_in: 6, src_out: 10 }}
      onConcluir={onConcluir} onCancelar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Concluir/ }));
    expect(onConcluir).toHaveBeenCalledWith(
      [{ src_in: 6, src_out: 10, speed: 1 }], "none", undefined, expect.any(Array));
  });

  it("VELOCIDADE do trecho vai junto na parte (Leva 4)", () => {
    const onConcluir = vi.fn();
    render(<SeqTrimDialog clip={CLIPE} onConcluir={onConcluir} onCancelar={vi.fn()} />);
    moverCursor(5);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Concluir/ }));
    expect(onConcluir).toHaveBeenCalledWith(
      [{ src_in: 0, src_out: 10, speed: 2 }], "none", undefined, expect.any(Array));
  });

  it("excluir de vez COLAPSA o trecho na fita e devolve a partição com dismissed", () => {
    const onConcluir = vi.fn();
    render(<SeqTrimDialog clip={CLIPE} principal onConcluir={onConcluir} onCancelar={vi.fn()}
      segsBase={[
        { id: 1, start: 0, end: 4, keep: true },
        { id: 2, start: 4, end: 7, keep: false },
        { id: 3, start: 7, end: 10, keep: true },
      ]} />);

    // o trecho removido está na fita, com o botão de excluir de vez
    const excluir = screen.getByTitle(/Excluir de vez/);
    fireEvent.click(excluir);
    // colapsou: o botão sumiu junto com o bloco, e a costura apareceu
    expect(screen.queryByTitle(/Excluir de vez/)).not.toBeInTheDocument();
    expect(screen.getByTitle(/Trecho excluído de vez/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Concluir/ }));
    // as partes não mudam (excluído de vez continua fora do vídeo)…
    expect(onConcluir).toHaveBeenCalledWith(
      [{ src_in: 0, src_out: 4, speed: 1 }, { src_in: 7, src_out: 10, speed: 1 }],
      "none", undefined, expect.any(Array));
    // …e a partição devolvida carrega o dismissed (o principal preserva na volta)
    const segsFinais = onConcluir.mock.calls[0][3];
    expect(segsFinais.find((x: { start: number }) => x.start === 4))
      .toMatchObject({ keep: false, dismissed: true });
  });

  it("modo PRINCIPAL esconde a emenda de entrada e a legenda do clipe", () => {
    // o principal é o primeiro (não tem emenda de entrada) e as legendas dele
    // vivem na aba Legendas — o resto da tela é idêntico
    render(<SeqTrimDialog clip={CLIPE} principal
      onConcluir={vi.fn()} onCancelar={vi.fn()} />);
    expect(screen.queryByText(/Legenda deste clipe/)).not.toBeInTheDocument();
    moverCursor(3);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));
    moverCursor(6);
    fireEvent.click(screen.getByRole("button", { name: /Dividir no cursor/ }));
    moverCursor(4.5);
    fireEvent.click(screen.getByRole("button", { name: /Tirar do clipe/ }));
    expect(screen.queryByText(/Entre as partes/)).not.toBeInTheDocument();
    // mas a velocidade continua lá: é o privilégio que o principal já tinha.
    // (o cursor precisa estar num trecho que FICA — acelerar o que sai não
    // faria sentido, então o seletor some no trecho removido)
    moverCursor(1);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
