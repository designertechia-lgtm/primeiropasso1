
-- Update profile name
UPDATE public.profiles
SET full_name = 'Dra. Marina Oliveira'
WHERE user_id = 'd8375605-5ba5-4bbb-aac7-6be323489ebd';

-- Insert professional record
INSERT INTO public.professionals (
  user_id,
  slug,
  crp,
  bio,
  approaches,
  hero_title,
  hero_subtitle,
  photo_url,
  hero_image_url,
  about_image_url,
  primary_color,
  secondary_color,
  background_color,
  whatsapp
) VALUES (
  'd8375605-5ba5-4bbb-aac7-6be323489ebd',
  'dra-marina-oliveira',
  'CRP 06/123456',
  'Psicóloga clínica com mais de 10 anos de experiência em atendimento individual e de casais. Graduada pela Universidade de São Paulo (USP) com pós-graduação em Terapia Cognitivo-Comportamental pelo Instituto de Psiquiatria do HC-FMUSP. Minha abordagem é integrativa, combinando técnicas baseadas em evidências científicas com um olhar humanizado e acolhedor. Trabalho especialmente com questões relacionadas à ansiedade, depressão, autoestima, relacionamentos e desenvolvimento pessoal. Acredito que cada pessoa possui recursos internos para transformar sua vida — e meu papel é ajudá-la a descobri-los e fortalecê-los.',
  ARRAY['Terapia Cognitivo-Comportamental (TCC)', 'Terapia de Aceitação e Compromisso (ACT)', 'Mindfulness', 'Psicologia Positiva'],
  'Dê o primeiro passo para uma mente equilibrada',
  'Atendimento online humanizado e acolhedor para você cuidar da sua saúde mental',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1200&h=600&fit=crop',
  'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&h=800&fit=crop',
  '#87A96B',
  '#C4A882',
  '#F5F0EB',
  '5511999999999'
);
