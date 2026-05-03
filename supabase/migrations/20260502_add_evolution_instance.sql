-- Adiciona o campo para armazenar o nome da instância da Evolution API vinculada ao profissional
ALTER TABLE professionals ADD COLUMN IF NOT EXISTS evolution_instance_name TEXT;
