ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS contact_title text,
  ADD COLUMN IF NOT EXISTS contact_subtitle text,
  ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'inter',
  ADD COLUMN IF NOT EXISTS font_size_scale text DEFAULT 'md';
