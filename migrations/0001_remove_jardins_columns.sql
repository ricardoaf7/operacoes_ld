ALTER TABLE service_areas
  DROP COLUMN IF EXISTS ultima_manutencao,
  DROP COLUMN IF EXISTS ultima_irrigacao,
  DROP COLUMN IF EXISTS ultima_plantio,
  DROP COLUMN IF EXISTS observacoes;
