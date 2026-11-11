-- P2 Postgres-ready: espejo de los JSON actuales (accounts/sessions/audit/foro_reportes)
-- Aplicar manualmente cuando DATABASE_URL esté definido. No se auto-migra aún.
CREATE TABLE IF NOT EXISTS accounts (
  email TEXT PRIMARY KEY,
  password_hash TEXT,
  rol TEXT NOT NULL DEFAULT 'estudiante',
  nombre TEXT NOT NULL DEFAULT '',
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  semestre TEXT,
  creado TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES accounts(email),
  rol TEXT NOT NULL,
  creado DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id BIGSERIAL PRIMARY KEY,
  ts DOUBLE PRECISION NOT NULL,
  ts_iso TEXT NOT NULL,
  evento TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS foro_reportes (
  id TEXT PRIMARY KEY,
  foro_id TEXT NOT NULL,
  mensaje_id TEXT,
  motivo TEXT NOT NULL DEFAULT '',
  denunciante TEXT NOT NULL,
  resuelto BOOLEAN NOT NULL DEFAULT FALSE,
  creado DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS actividades (
  id BIGSERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  owner_id BIGINT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS actividades_grupo (
  actividad_id BIGINT NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  grupo_id BIGINT NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  PRIMARY KEY (actividad_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_actividades_grupo ON actividades_grupo (grupo_id);
ALTER TABLE grupos ADD COLUMN IF NOT EXISTS especialidad TEXT NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS idx_grupos_lookup ON grupos (ciclo_escolar, anio, especialidad, seccion);
