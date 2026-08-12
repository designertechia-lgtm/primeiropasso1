import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ChatTexto from "@/components/admin/ChatTexto";

// O que este teste protege: nenhuma marcação do modelo pode CHEGAR À TELA como caractere.
// O sintoma que originou o componente (balões do Diretor/Axel) reapareceu no DNA da Marca,
// onde as seções eram <textarea> — campo de texto puro, que mostra `##` e `**` crus.

afterEach(cleanup);

// Trecho REAL do DNA da Marca da DesignerTech, copiado da tela do profissional.
const SECAO_VILAO = `## Problema Central e o Vilão — DesignerTech

**O inimigo nomeado: Complexidade acumulada sem intenção**
O verdadeiro vilão não é a falta de habilidade técnica. É a *camada invisível de complexidade não planejada* que se acumula a cada sprint: ferramentas que não conversam entre si, automações pela metade, integrações frágeis e processos manuais que ninguém questionou porque sempre funcionaram *mais ou menos*.

**Por que outras tentativas falharam**
- Ansiedade constante porque o próximo prazo já chegou antes do atual terminar
- Retrabalho que ninguém contabiliza`;

describe("ChatTexto — texto do DNA da Marca", () => {
  it("não deixa nenhum ** ou ## visível na tela", () => {
    const { container } = render(<ChatTexto texto={SECAO_VILAO} variant="documento" />);
    const visivel = container.textContent || "";
    expect(visivel).not.toMatch(/\*/);
    expect(visivel).not.toMatch(/#/);
    // O conteúdo continua todo lá — nada foi engolido junto com a marcação.
    expect(visivel).toContain("Complexidade acumulada sem intenção");
    expect(visivel).toContain("Retrabalho que ninguém contabiliza");
  });

  it("transforma ## em título e ** em negrito", () => {
    render(<ChatTexto texto={SECAO_VILAO} variant="documento" />);
    expect(screen.getByText("Problema Central e o Vilão — DesignerTech")).toBeInTheDocument();
    const negrito = screen.getByText("O inimigo nomeado: Complexidade acumulada sem intenção");
    expect(negrito.tagName).toBe("STRONG");
  });

  it("desenha os marcadores como lista de verdade", () => {
    const { container } = render(<ChatTexto texto={SECAO_VILAO} variant="documento" />);
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("asterisco solto é itálico no documento e negrito no chat", () => {
    // Mesma string, intenções diferentes: o modelo escreve markdown (`*x*` = itálico);
    // quem digita num chat escreve como no WhatsApp (`*x*` = negrito).
    const t = "É a *camada invisível* que cresce.";

    const doc = render(<ChatTexto texto={t} variant="documento" />);
    expect(doc.container.querySelector("em")?.textContent).toBe("camada invisível");
    expect(doc.container.querySelector("strong")).toBeNull();
    cleanup();

    const chat = render(<ChatTexto texto={t} />);
    expect(chat.container.querySelector("strong")?.textContent).toBe("camada invisível");
  });

  it("asterisco de conta não vira formatação (regressão do balão)", () => {
    const { container } = render(<ChatTexto texto="Sai por R$ 5,00 * 2 = R$ 10,00." />);
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("em")).toBeNull();
    expect(container.textContent).toBe("Sai por R$ 5,00 * 2 = R$ 10,00.");
  });
});
