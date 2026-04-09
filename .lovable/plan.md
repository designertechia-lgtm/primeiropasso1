

## Plano: Adicionar gráficos de conversão de leads e atendimentos ao Painel

### O que será adicionado
Dois gráficos abaixo dos cards existentes no `AdminDashboard.tsx`:

1. **Gráfico de barras "Leads por mês"** — mostra quantidade de leads capturados nos últimos 6 meses
2. **Gráfico de barras "Atendimentos por mês"** — mostra quantidade de appointments nos últimos 6 meses, com barras coloridas por status (confirmado, pendente, cancelado)
3. **Card "Taxa de conversão"** — percentual de leads que viraram appointments (leads com mesmo nome/whatsapp que têm appointment associado, ou simplesmente razão appointments/leads no período)

### Biblioteca
Usar **Recharts** (já disponível via shadcn/ui `chart.tsx` que existe no projeto).

### Alterações

**`src/pages/admin/AdminDashboard.tsx`**
- Adicionar query para buscar `leads` com `created_at` dos últimos 6 meses, agrupando por mês
- Adicionar query para buscar `appointments` com `appointment_date` dos últimos 6 meses, agrupando por mês e status
- Renderizar 2 gráficos de barras usando `ChartContainer` do shadcn + Recharts (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`)
- Adicionar card com taxa de conversão (total appointments / total leads × 100)
- Layout: grid de 2 colunas para os gráficos, responsivo (1 coluna em mobile)

### Dados consultados
```sql
-- Leads por mês (últimos 6 meses)
SELECT * FROM leads WHERE professional_id = ? AND created_at >= now() - interval '6 months'

-- Appointments por mês (últimos 6 meses)  
SELECT * FROM appointments WHERE professional_id = ? AND appointment_date >= current_date - interval '6 months'
```

O agrupamento por mês será feito no frontend (JavaScript) para simplicidade.

### Visual
```text
┌─ Artigos ─┐ ┌─ Vídeos ──┐ ┌─ Leads ───┐
│    12     │ │     5     │ │    34     │
└───────────┘ └───────────┘ └───────────┘

┌─ Leads por mês ──────────┐ ┌─ Atendimentos por mês ───┐
│  ██                      │ │  ██ ██                    │
│  ██ ██    ██             │ │  ██ ██ ██    ██           │
│  ██ ██ ██ ██ ██ ██       │ │  ██ ██ ██ ██ ██ ██       │
│  Nov Dez Jan Fev Mar Abr │ │  Nov Dez Jan Fev Mar Abr │
└──────────────────────────┘ └──────────────────────────┘

┌─ Taxa de Conversão ──────────────────────────────────┐
│  42% dos leads converteram em atendimentos           │
└──────────────────────────────────────────────────────┘
```

### Arquivo modificado
- `src/pages/admin/AdminDashboard.tsx`

