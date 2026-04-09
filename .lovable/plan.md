

## Plano: Criar perfil profissional de demonstração

### Situação atual
Existem 2 usuários com role `professional` mas nenhum registro na tabela `professionals`. Vou criar um registro completo para **Carlos Carneiro** (user_id: `d8375605-...`) com dados fictícios coerentes.

### Dados a inserir

**1. UPDATE `profiles`** — Atualizar nome para o personagem demo
- `full_name`: "Dra. Marina Oliveira"

**2. INSERT `professionals`** — Registro completo:
- **user_id**: `d8375605-5ba5-4bbb-aac7-6be323489ebd`
- **slug**: `dra-marina-oliveira`
- **crp**: `CRP 06/123456`
- **bio**: Texto profissional (~150 palavras) sobre formação em psicologia clínica, experiência com ansiedade, depressão e autoconhecimento, pós-graduação em TCC pelo Instituto de Psiquiatria do HC-FMUSP
- **approaches**: `["Terapia Cognitivo-Comportamental (TCC)", "Terapia de Aceitação e Compromisso (ACT)", "Mindfulness", "Psicologia Positiva"]`
- **hero_title**: "Dê o primeiro passo para uma mente equilibrada"
- **hero_subtitle**: "Atendimento online humanizado e acolhedor para você cuidar da sua saúde mental"
- **photo_url**: Foto profissional do Unsplash (mulher em ambiente de consultório)
- **hero_image_url**: Imagem suave/acolhedora do Unsplash
- **about_image_url**: Foto profissional alternativa do Unsplash
- **primary_color**: `#87A96B` (verde sage — as cores secundária e fundo serão derivadas automaticamente pelo sistema existente ao salvar via admin)
- **secondary_color**: `#C4A882` (preenchido manualmente para demo funcionar na landing)
- **background_color**: `#F5F0EB`
- **whatsapp**: `5511999999999`

### Resultado
A landing page ficará acessível em `/{slug}` (ex: `/dra-marina-oliveira`) com todos os dados visuais preenchidos. Nenhuma alteração de código necessária.

