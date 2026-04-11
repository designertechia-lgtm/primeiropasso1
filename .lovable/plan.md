

## Corrigir nome do paciente e descricao do servico na lista de Agendamentos

### Problemas

1. **Coluna "Paciente"** mostra "Paciente" generico -- o lookup de perfil ja existe mas pode falhar porque `patient_id` pode ser null ou o perfil nao tem `full_name`. Precisa mostrar o nome real quando disponivel.

2. **Coluna "Servico"** mostra "—" -- a join `professional_services(name, ...)` provavelmente falha silenciosamente porque nao ha foreign key definida entre `appointments.service_id` e `professional_services.id`. Precisamos buscar os servicos separadamente.

### Solucao

**Arquivo: `src/pages/admin/AdminAgendamentos.tsx`**

1. Alem de buscar profiles, buscar tambem os servicos (`professional_services`) do profissional e montar um mapa `serviceId -> service`
2. Na coluna "Paciente": usar `appt.patient?.full_name || "Sem paciente"`
3. Na coluna "Servico": usar o mapa de servicos para mostrar `service.name` (nome do servico) e como fallback mostrar `appt.notes` (descricao/notas do agendamento) ou "—"

### Detalhes tecnicos

Na query, substituir a join `professional_services(name, ...)` por uma busca separada:

```typescript
// Buscar servicos
const serviceIds = [...new Set(data.filter(a => a.service_id).map(a => a.service_id))];
let serviceMap = new Map();
if (serviceIds.length > 0) {
  const { data: services } = await supabase
    .from("professional_services")
    .select("id, name, description, duration_minutes, price")
    .in("id", serviceIds);
  serviceMap = new Map(services?.map(s => [s.id, s]) ?? []);
}

return data.map((a) => ({
  ...a,
  patient: profileMap.get(a.patient_id),
  service: serviceMap.get(a.service_id),
}));
```

Na renderizacao:
- Paciente: `appt.patient?.full_name || "Sem paciente"`
- Servico: `appt.service?.name || appt.notes || "—"`

### Arquivos alterados
- `src/pages/admin/AdminAgendamentos.tsx`

