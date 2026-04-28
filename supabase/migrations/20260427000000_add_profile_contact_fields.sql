ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS phone       text,
  ADD COLUMN IF NOT EXISTS email       text,
  ADD COLUMN IF NOT EXISTS address     text,
  ADD COLUMN IF NOT EXISTS instagram   text,
  ADD COLUMN IF NOT EXISTS linkedin    text;
