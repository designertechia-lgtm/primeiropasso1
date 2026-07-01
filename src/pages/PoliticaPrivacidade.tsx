import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

// Política de Privacidade / LGPD da plataforma (cobre as landings dos profissionais).
// Texto-base genérico — revisar com apoio jurídico antes de considerar definitivo.
export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-10 md:py-16">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-8">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <h1 className="font-heading text-3xl md:text-4xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground mb-8">Última atualização: julho de 2026</p>

        <div className="space-y-6 text-[15px] leading-relaxed text-foreground/90">
          <section className="space-y-2">
            <h2 className="font-heading text-xl font-semibold">1. Quem trata seus dados</h2>
            <p>
              Esta página é disponibilizada por um profissional de saúde por meio da plataforma
              <strong> Primeiro Passo</strong>. O profissional é o responsável (controlador) pelos dados de
              contato que você fornece; a plataforma atua como operadora, dando suporte técnico ao tratamento.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-xl font-semibold">2. Dados que coletamos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Dados de contato</strong> que você envia voluntariamente (por exemplo, ao iniciar uma conversa no WhatsApp): nome e número de telefone.</li>
              <li><strong>Dados de navegação e medição</strong>: cookies e identificadores de campanha (UTMs), além de tecnologias de medição de terceiros (ex.: Meta Pixel e Google Tag), <em>somente</em> se você consentir.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-xl font-semibold">3. Para que usamos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Responder ao seu contato e agendar atendimentos.</li>
              <li>Entender o desempenho da página e de campanhas de anúncios (métricas agregadas).</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-xl font-semibold">4. Cookies e medição</h2>
            <p>
              Cookies essenciais garantem o funcionamento da página. Cookies e pixels de medição
              (Meta/Google) só são carregados <strong>após o seu consentimento</strong> no aviso exibido ao
              abrir a página. Você pode recusar os não essenciais sem prejuízo à navegação e pode revisar sua
              escolha limpando os dados do site no navegador.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-xl font-semibold">5. Compartilhamento</h2>
            <p>
              Não vendemos seus dados. Quando você consente com a medição, informações de navegação podem ser
              processadas por provedores como Meta e Google exclusivamente para fins de análise e otimização de
              anúncios, conforme as políticas dessas empresas.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-xl font-semibold">6. Seus direitos (LGPD)</h2>
            <p>
              Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus dados, além de revogar o
              consentimento a qualquer momento. Para exercer esses direitos, entre em contato com o profissional
              responsável pela página pelos canais informados nela.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="font-heading text-xl font-semibold">7. Retenção</h2>
            <p>
              Mantemos os dados apenas pelo tempo necessário às finalidades acima ou conforme exigência legal, e
              os eliminamos com segurança quando não forem mais necessários.
            </p>
          </section>

          <p className="text-xs text-muted-foreground pt-4 border-t">
            Este é um texto-base informativo e não substitui aconselhamento jurídico. O profissional
            responsável pode adaptá-lo à sua realidade e às regras do seu conselho de classe.
          </p>
        </div>
      </div>
    </div>
  );
}
