

## Plan: Vincular paciente ao profissional do link acessado

### Problema
Quando um paciente se cadastra, ele não fica vinculado ao profissional cuja landing page ele visitou. Não existe uma tabela de relacionamento paciente-profissional.

### Alterações

**1. Migração SQL** -- Criar tabela `patient_professionals` para vincular pacientes a profissionais:
```sql
CREATE TABLE public.patient_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(patient_id, professional_id)
);
ALTER TABLE public.patient_professionals ENABLE ROW LEVEL SECURITY;

-- Pacientes e profissionais podem ver seus vínculos
CREATE POLICY "Patients can view own links" ON public.patient_professionals
  FOR SELECT USING (auth.uid() = patient_id);
CREATE POLICY "Professionals can view own patients" ON public.patient_professionals
  FOR SELECT USING (EXISTS (SELECT 1 FROM professionals p WHERE p.id = patient_professionals.professional_id AND p.user_id = auth.uid()));
CREATE POLICY "Anyone authenticated can insert" ON public.patient_professionals
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = patient_id);
```

**2. Propagar o slug do profissional no fluxo de cadastro:**

- **Landing page → Login/Cadastro**: Os links "Entrar" no `LandingHeader.tsx` passarão o slug como query param: `/login?ref=slug` e `/cadastro?ref=slug`
- **`Login.tsx`**: Propagar o `?ref=` para o link "Cadastre-se"
- **`Cadastro.tsx`**: Ler o `?ref=` da URL. Se presente e o role for `patient`, após o signup buscar o `professional_id` pelo slug e inserir na tabela `patient_professionals`

**3. Atualizar `handle_new_user` trigger (alternativa mais robusta):**
- Salvar o slug de referência nos metadados do signup (`data: { ref_slug }`)
- Na trigger `handle_new_user`, se `ref_slug` existir e o role for `patient`, inserir o vínculo automaticamente

### Fluxo
```text
Paciente visita /daiane (landing do profissional)
  → Clica "Entrar" → /login?ref=daiane
  → Clica "Cadastre-se" → /cadastro?ref=daiane
  → Se cadastra como paciente
  → Trigger insere vínculo em patient_professionals
  → Paciente fica vinculado à profissional "daiane"
```

### Resultado
Todo paciente que se cadastra a partir da página de um profissional fica automaticamente vinculado a ele no banco de dados.

