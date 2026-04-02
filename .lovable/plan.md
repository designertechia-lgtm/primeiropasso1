

# Plano Atualizado — Primeiro Passo (Multi-Tenant + Agendamento)

## Visao Geral

O sistema deixa de ser para uma unica profissional e passa a ser uma **plataforma multi-tenant** onde varios profissionais criam seus perfis independentes. Pacientes criam conta, agendam consultas e gerenciam seus agendamentos. Pagamento e apenas registro manual (pago/pendente).

---

## Arquitetura Multi-Tenant

Cada profissional tera um **slug** unico na URL:
- `primeiropasso.com/daiane` → Landing Page da Daiane
- `primeiropasso.com/joao` → Landing Page do Joao
- `primeiropasso.com/` → Pagina inicial da plataforma (vitrine de profissionais ou redirect)

---

## Banco de Dados (Supabase)

### Tabelas

| Tabela | Descricao |
|--------|-----------|
| `profiles` | Dados do usuario (nome, avatar, tipo: profissional/paciente), FK auth.users |
| `user_roles` | Roles: `professional`, `patient`, `admin` |
| `professionals` | slug, CRP, bio, foto, abordagens, whatsapp, logo, cores — tudo editavel |
| `professional_services` | Servicos oferecidos (tipo, duracao, preco) |
| `availability` | Horarios disponiveis do profissional (dia da semana, hora inicio/fim) |
| `appointments` | Agendamentos: paciente, profissional, servico, data/hora, status (pendente/confirmado/cancelado), pagamento (pendente/pago) |
| `articles` | Conteudo do blog, FK professional |
| `videos` | Videos, FK professional |
| `leads` | Captacao de leads, FK professional |
| `site_settings` | Config por profissional (frase hero, cores, etc.) |

### RLS
- Profissional: CRUD completo nos seus proprios dados
- Paciente: ver dados publicos, criar/ver/cancelar seus agendamentos
- Anon: ver landing pages publicas, inserir leads

### Storage
- Bucket `images` para fotos, logos e imagens de artigos (organizado por professional_id)

---

## Paginas e Rotas

### Publicas
| Rota | Descricao |
|------|-----------|
| `/` | Home da plataforma (lista profissionais ou pagina institucional) |
| `/:slug` | Landing Page do profissional |
| `/:slug/agendar` | Pagina de agendamento (selecionar servico, data, horario) |
| `/login` | Login (email/senha) |
| `/cadastro` | Registro (paciente ou profissional) |

### Paciente (logado)
| Rota | Descricao |
|------|-----------|
| `/minha-conta` | Dashboard do paciente |
| `/minha-conta/agendamentos` | Lista de agendamentos (confirmar, cancelar) |

### Profissional (logado)
| Rota | Descricao |
|------|-----------|
| `/admin` | Dashboard (leads da semana, proximos agendamentos) |
| `/admin/agenda` | Gerenciar disponibilidade + ver agendamentos |
| `/admin/agendamentos` | Lista de agendamentos (confirmar, marcar pago, cancelar) |
| `/admin/artigos` | CRUD artigos |
| `/admin/videos` | CRUD videos |
| `/admin/biografia` | Editar bio, CRP, foto, abordagens |
| `/admin/configuracoes` | WhatsApp, logo, cores, frase hero, slug |

---

## Fluxo de Agendamento

```text
Paciente visita /:slug
  → Clica "Agendar Consulta"
  → /:slug/agendar
  → Seleciona servico
  → Ve calendario com horarios disponiveis
  → Se nao logado: redireciona para /login (volta depois)
  → Confirma agendamento
  → Status: PENDENTE
  → Profissional confirma no painel → CONFIRMADO
  → Profissional marca pagamento → PAGO
  → Paciente pode cancelar ate X horas antes
```

---

## Ordem de Implementacao

| Passo | Descricao |
|-------|-----------|
| 1 | **Migracao SQL** — todas as tabelas, RLS, storage bucket |
| 2 | **Design System** — paleta verde salvia/terrosos, fontes |
| 3 | **Auth** — login, cadastro, roles (profissional/paciente), ProtectedRoute |
| 4 | **Landing Page dinamica** — `/:slug` carrega dados do profissional |
| 5 | **Painel profissional** — CRUD completo (bio, artigos, videos, config, logo) |
| 6 | **Sistema de disponibilidade** — profissional define horarios |
| 7 | **Pagina de agendamento** — paciente seleciona servico + horario |
| 8 | **Dashboard paciente** — ver/cancelar agendamentos |
| 9 | **Gestao de agendamentos (profissional)** — confirmar, marcar pago, cancelar |
| 10 | **Leads + formulario** — captacao na landing page |
| 11 | **Home da plataforma** — vitrine de profissionais |

---

## Detalhes Tecnicos

- **Auth**: Supabase Auth com email/senha. Trigger para criar profile automaticamente no signup
- **Roles**: tabela `user_roles` separada (seguranca), funcao `has_role()` security definer
- **Convites**: profissional pode convidar paciente via Supabase Auth invite
- **Pagamento**: coluna `payment_status` em appointments (pendente/pago) — sem gateway, apenas controle manual
- **WhatsApp**: botao CTA usa `wa.me/{numero}` configurado pelo profissional
- **SEO**: `react-helmet-async` com meta tags dinamicas por profissional
- **Responsivo**: mobile-first com Tailwind

