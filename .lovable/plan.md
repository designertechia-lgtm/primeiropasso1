

## Plano: Remover sistema de videochamada

### O que será removido
Todo o sistema de videochamada via Jitsi Meet: componente, página da sala virtual, botões de videochamada nos agendamentos e rota.

### Alterações

**1. Deletar arquivos**
- `src/components/VideoCall.tsx`
- `src/pages/admin/AdminSalaVirtual.tsx`

**2. `src/components/dashboard/DashboardSidebar.tsx`**
- Remover item "Sala Virtual" da lista de navegação

**3. `src/App.tsx`**
- Remover rota `/admin/sala-virtual` e import do `AdminSalaVirtual`

**4. `src/pages/admin/AdminAgendamentos.tsx`**
- Remover import do `VideoCall` e ícone `Video`
- Remover estado `activeCall` e lógica de videochamada
- Remover botão "Iniciar Videochamada" da listagem

**5. `src/pages/paciente/PatientAgendamentos.tsx`**
- Remover import do `VideoCall` e ícone `Video`
- Remover estado `activeCall`, função `canJoinCall` e lógica de videochamada
- Remover botão de videochamada da listagem

**Nota:** A coluna `video_room_id` na tabela `appointments` será mantida no banco (não causa problemas) para evitar migração desnecessária.

