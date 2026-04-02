

## Plano: Substituir "Buscar Profissionais" pela agenda do profissional vinculado

### Contexto
O paciente é vinculado a um profissional via tabela `patient_professionals` (criada pelo fluxo de cadastro com `ref_slug`). A página inicial `/minha-conta` atualmente mostra busca por profissionais. Vamos substituí-la pela tela de agendamento do profissional vinculado.

### Alterações

**1. `src/pages/paciente/PatientBuscar.tsx`** — Reescrever completamente:
- Buscar o `professional_id` do paciente na tabela `patient_professionals` usando `auth.uid()`
- Buscar dados do profissional (slug, foto, nome, abordagens, CRP) via `professionals` + `profiles`
- Reutilizar a lógica de `PatientAgendar.tsx` inline: calendário, slots de horários disponíveis (07:00–20:00), seleção de serviço, observações, botão de confirmar
- Se o paciente não tiver profissional vinculado, exibir mensagem orientando a acessar a página de um profissional primeiro
- Renomear o título da página para "Agendar Consulta" ou similar

**2. `src/components/dashboard/PatientSidebar.tsx`**:
- Trocar item "Buscar Profissionais" (ícone Search) por "Agendar Consulta" (ícone CalendarPlus ou Calendar)
- Manter URL `/minha-conta`

**3. `src/App.tsx`**:
- Remover rota `/minha-conta/agendar/:slug` (não mais necessária, agendamento é direto)
- Ou manter como fallback — decisão: manter por compatibilidade

### Fluxo resultante
```text
Paciente acessa /minha-conta
  → Busca vínculo em patient_professionals
  → Carrega dados do profissional vinculado
  → Mostra calendário + horários livres (07:00–20:00)
  → Paciente seleciona data, horário, serviço
  → Confirma agendamento
```

### Detalhes técnicos
- Query: `supabase.from("patient_professionals").select("professional_id").eq("patient_id", user.id).limit(1).single()`
- Depois: `supabase.from("professionals").select("*").eq("id", professional_id).single()`
- Lógica de slots idêntica à de `PatientAgendar.tsx` (conflitos com appointments + schedule_blocks)
- Manter rota `/minha-conta/agendar/:slug` funcional para acesso direto

