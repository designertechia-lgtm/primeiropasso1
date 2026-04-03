

## Plano: Videochamada com Jitsi Meet

### O que muda
Integrar videochamadas usando Jitsi Meet (gratuito, sem conta necessária). Cada agendamento confirmado terá um botão "Iniciar Videochamada" quando chegar o horário. O profissional também terá uma sala fixa disponível a qualquer momento.

### Alterações

**1. Banco de dados** — Adicionar coluna `video_room_id` na tabela `appointments`:
- `ALTER TABLE appointments ADD COLUMN video_room_id text` — identificador único da sala Jitsi para cada agendamento
- Gerado automaticamente ao confirmar o agendamento (ex: `primeiropasso-{appointment_id_curto}`)

**2. Componente `VideoCall.tsx`** — Novo componente reutilizável:
- Embed do Jitsi Meet via iframe (`https://meet.jit.si/{roomName}`)
- Props: `roomName`, `displayName`, `onClose`
- Fullscreen ou modal com botão de fechar
- Configurações: desabilitar lobby, definir nome do participante automaticamente

**3. Página do Paciente — `/minha-conta/agendamentos`** (`PatientAgendamentos.tsx`):
- Nos agendamentos com status `confirmed`, exibir botão "Entrar na Videochamada"
- Botão visível apenas quando a data/hora do agendamento é hoje e está dentro de uma janela (ex: 10 min antes até o fim)
- Ao clicar, abre o componente `VideoCall` com a sala do agendamento

**4. Página do Profissional — `/admin/agendamentos`** (`AdminAgendamentos.tsx`):
- Mesmo botão "Iniciar Videochamada" nos agendamentos confirmados do dia
- Profissional pode iniciar a sala a qualquer momento para agendamentos de hoje

**5. Sala fixa do profissional** — `/admin/sala-virtual` (nova página):
- Sala permanente com nome baseado no slug do profissional (ex: `primeiropasso-dr-carlos`)
- Profissional pode compartilhar link ou iniciar direto
- Adicionada no sidebar do admin com ícone Video

**6. Sidebar do Paciente** (`PatientSidebar.tsx`):
- Sem alteração — acesso à videochamada é pelo card do agendamento

**7. Sidebar do Admin** (`DashboardSidebar.tsx`):
- Novo item "Sala Virtual" com ícone Video, link para `/admin/sala-virtual`

**8. Rota** (`App.tsx`):
- Adicionar `/admin/sala-virtual` como rota protegida profissional

### Fluxo
```text
Agendamento confirmado (hoje)
  → Paciente vê botão "Entrar na Videochamada"
  → Profissional vê botão "Iniciar Videochamada"
  → Ambos entram na mesma sala Jitsi (iframe)

Sala fixa (profissional)
  → /admin/sala-virtual
  → Sala sempre disponível para uso avulso
  → Pode compartilhar link com paciente
```

### Detalhes técnicos
- Jitsi é 100% gratuito e não requer API key
- URL do iframe: `https://meet.jit.si/{roomName}?#config.prejoinPageEnabled=false&userInfo.displayName={name}`
- Room names únicos por agendamento evitam conflitos
- Sem necessidade de edge functions ou backend adicional

