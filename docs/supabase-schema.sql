CREATE TABLE IF NOT EXISTS perfiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nombre TEXT,
  rol TEXT NOT NULL DEFAULT 'estudiante'
    CHECK (rol IN ('estudiante','docente','director','subdirector','coordinador','padres','admin')),
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios ven su propio perfil" ON perfiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuarios actualizan su propio perfil" ON perfiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin ve todos los perfiles" ON perfiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);

CREATE TABLE IF NOT EXISTS aulas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  capacidad INTEGER DEFAULT 30,
  ubicacion TEXT,
  tipo TEXT DEFAULT 'salon',
  equipamiento TEXT DEFAULT 'basico',
  especialidad TEXT DEFAULT 'general',
  anio TEXT,
  seccion TEXT,
  descripcion TEXT,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE aulas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos ven aulas" ON aulas FOR SELECT USING (true);
CREATE POLICY "Docentes crean aulas" ON aulas FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('docente','admin','director'))
);
CREATE POLICY "Owner edita aula" ON aulas FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owner elimina aula" ON aulas FOR DELETE USING (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS aula_inscripciones (
  id SERIAL PRIMARY KEY,
  aula_id INTEGER REFERENCES aulas(id) ON DELETE CASCADE,
  estudiante_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado')),
  fecha TIMESTAMPTZ DEFAULT now(),
  UNIQUE(aula_id, estudiante_id)
);

ALTER TABLE aula_inscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inscripciones visibles para involucrados" ON aula_inscripciones FOR SELECT USING (
  auth.uid() = estudiante_id
  OR EXISTS (SELECT 1 FROM aulas WHERE id = aula_id AND owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);
CREATE POLICY "Estudiantes se inscriben" ON aula_inscripciones FOR INSERT WITH CHECK (auth.uid() = estudiante_id);
CREATE POLICY "Docente aprueba/rechaza" ON aula_inscripciones FOR UPDATE USING (
  EXISTS (SELECT 1 FROM aulas WHERE id = aula_id AND owner_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS aula_tareas (
  id SERIAL PRIMARY KEY,
  aula_id INTEGER REFERENCES aulas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  materia TEXT,
  grupo TEXT,
  fecha_limite DATE,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE aula_tareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inscritos ven tareas" ON aula_tareas FOR SELECT USING (
  EXISTS (SELECT 1 FROM aula_inscripciones WHERE aula_id = aula_tareas.aula_id AND estudiante_id = auth.uid() AND estado = 'aprobado')
  OR EXISTS (SELECT 1 FROM aulas WHERE id = aula_id AND owner_id = auth.uid())
);
CREATE POLICY "Docente crea tareas" ON aula_tareas FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM aulas WHERE id = aula_id AND owner_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS aula_entregas (
  id SERIAL PRIMARY KEY,
  tarea_id INTEGER REFERENCES aula_tareas(id) ON DELETE CASCADE,
  estudiante_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  respuesta TEXT,
  archivo_url TEXT,
  archivo_nombre TEXT,
  fecha TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tarea_id, estudiante_id)
);

ALTER TABLE aula_entregas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Estudiante ve sus entregas" ON aula_entregas FOR SELECT USING (
  auth.uid() = estudiante_id
  OR EXISTS (
    SELECT 1 FROM aula_tareas t
    JOIN aulas a ON a.id = t.aula_id
    WHERE t.id = tarea_id AND a.owner_id = auth.uid()
  )
);
CREATE POLICY "Estudiante entrega" ON aula_entregas FOR INSERT WITH CHECK (auth.uid() = estudiante_id);
CREATE POLICY "Estudiante actualiza su entrega" ON aula_entregas FOR UPDATE USING (auth.uid() = estudiante_id);

-- 6. CALIFICACIONES
CREATE TABLE IF NOT EXISTS aula_calificaciones (
  id SERIAL PRIMARY KEY,
  entrega_id INTEGER REFERENCES aula_entregas(id) ON DELETE CASCADE,
  nota NUMERIC(5,2) CHECK (nota >= 0 AND nota <= 100),
  retroalimentacion TEXT,
  calificado_por UUID REFERENCES auth.users(id),
  fecha TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE aula_calificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ven calificaciones los involucrados" ON aula_calificaciones FOR SELECT USING (
  EXISTS (SELECT 1 FROM aula_entregas WHERE id = entrega_id AND estudiante_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM aula_entregas e
    JOIN aula_tareas t ON t.id = e.tarea_id
    JOIN aulas a ON a.id = t.aula_id
    WHERE e.id = entrega_id AND a.owner_id = auth.uid()
  )
);
CREATE POLICY "Docente califica" ON aula_calificaciones FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM aula_entregas e
    JOIN aula_tareas t ON t.id = e.tarea_id
    JOIN aulas a ON a.id = t.aula_id
    WHERE e.id = entrega_id AND a.owner_id = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS estudiantes (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT,
  anio TEXT,
  especialidad TEXT,
  seccion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE estudiantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Docentes ven estudiantes" ON estudiantes FOR SELECT USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('docente','admin','director','coordinador'))
);
CREATE POLICY "Admin gestiona estudiantes" ON estudiantes FOR ALL USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);

CREATE TABLE IF NOT EXISTS planificaciones (
  id SERIAL PRIMARY KEY,
  semana TEXT,
  materia TEXT NOT NULL,
  unidad TEXT,
  objetivos TEXT,
  actividades TEXT,
  recursos TEXT,
  evaluacion TEXT,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE planificaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Docentes ven sus planificaciones" ON planificaciones FOR SELECT USING (
  auth.uid() = owner_id
  OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);
CREATE POLICY "Docente crea planificaciones" ON planificaciones FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS actividades (
  id SERIAL PRIMARY KEY,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE actividades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos ven actividades" ON actividades FOR SELECT USING (true);
CREATE POLICY "Docente crea actividades" ON actividades FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('docente','admin','director'))
);

CREATE TABLE IF NOT EXISTS mat_solicitudes (
  id SERIAL PRIMARY KEY,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  email TEXT NOT NULL,
  telefono TEXT,
  anio TEXT,
  especialidad TEXT,
  seccion TEXT,
  estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente','aprobado','rechazado')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mat_solicitudes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin ve solicitudes" ON mat_solicitudes FOR SELECT USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);
CREATE POLICY "Cualquiera envía solicitud" ON mat_solicitudes FOR INSERT WITH CHECK (true);

-- =====================================================
-- GRUPOS / MATRÍCULA (separación por año y sección)
-- =====================================================
CREATE TABLE IF NOT EXISTS grupos (
  id SERIAL PRIMARY KEY,
  anio TEXT NOT NULL,
  seccion TEXT NOT NULL,
  ciclo_escolar TEXT NOT NULL,
  UNIQUE(anio, seccion, ciclo_escolar)
);

ALTER TABLE grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grupos_select_docente_admin" ON grupos FOR SELECT USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director','coordinador'))
  OR EXISTS (SELECT 1 FROM docente_grupo dg WHERE dg.grupo_id = grupos.id AND dg.docente_id = auth.uid())
);
CREATE POLICY "grupos_select_estudiante_propio" ON grupos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM estudiantes e
    JOIN perfiles p ON p.email = e.email
    WHERE p.id = auth.uid() AND e.grupo_id = grupos.id
  )
);
CREATE POLICY "grupos_insert_admin" ON grupos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);
CREATE POLICY "grupos_update_admin" ON grupos FOR UPDATE USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);
CREATE POLICY "grupos_delete_admin" ON grupos FOR DELETE USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);

CREATE TABLE IF NOT EXISTS docente_grupo (
  docente_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  grupo_id INTEGER REFERENCES grupos(id) ON DELETE CASCADE,
  materia TEXT NOT NULL,
  PRIMARY KEY (docente_id, grupo_id, materia)
);

ALTER TABLE docente_grupo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docente_grupo_select" ON docente_grupo FOR SELECT USING (
  auth.uid() = docente_id
  OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);
CREATE POLICY "docente_grupo_insert" ON docente_grupo FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
  OR auth.uid() = docente_id
);
CREATE POLICY "docente_grupo_delete" ON docente_grupo FOR DELETE USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);

-- estudiantes: añadir grupo_id (migración compatible, nullable)
ALTER TABLE estudiantes ADD COLUMN IF NOT EXISTS grupo_id INTEGER REFERENCES grupos(id);

DROP POLICY IF EXISTS "Docentes ven estudiantes" ON estudiantes;
DROP POLICY IF EXISTS "Admin gestiona estudiantes" ON estudiantes;
CREATE POLICY "estudiantes_select_docente_admin" ON estudiantes FOR SELECT USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('docente','admin','director','coordinador'))
);
CREATE POLICY "estudiantes_select_own" ON estudiantes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM perfiles p
    JOIN estudiantes e ON e.email = p.email
    WHERE p.id = auth.uid() AND e.id = estudiantes.id
  )
);
CREATE POLICY "estudiantes_insert_admin" ON estudiantes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);
CREATE POLICY "estudiantes_update_admin" ON estudiantes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);

-- asignaciones: un item (tarea/examen) asignado a uno o varios grupos
CREATE TABLE IF NOT EXISTS asignaciones (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('tarea','examen')),
  item_id INTEGER NOT NULL,
  grupo_id INTEGER NOT NULL REFERENCES grupos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tipo, item_id, grupo_id)
);

ALTER TABLE asignaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asignaciones_select" ON asignaciones FOR SELECT USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
  OR EXISTS (
    SELECT 1 FROM docente_grupo dg
    WHERE dg.grupo_id = asignaciones.grupo_id AND dg.docente_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM estudiantes e
    JOIN perfiles p ON p.email = e.email
    WHERE p.id = auth.uid() AND e.grupo_id = asignaciones.grupo_id
  )
);
CREATE POLICY "asignaciones_insert_docente" ON asignaciones FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM docente_grupo dg
    WHERE dg.grupo_id = asignaciones.grupo_id AND dg.docente_id = auth.uid()
  )
  OR EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);
CREATE POLICY "asignaciones_delete_admin" ON asignaciones FOR DELETE USING (
  EXISTS (SELECT 1 FROM perfiles WHERE id = auth.uid() AND rol IN ('admin','director'))
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_estudiantes_grupo ON estudiantes(grupo_id);
CREATE INDEX IF NOT EXISTS idx_docente_grupo_docente ON docente_grupo(docente_id);
CREATE INDEX IF NOT EXISTS idx_docente_grupo_grupo ON docente_grupo(grupo_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_item ON asignaciones(tipo, item_id);
CREATE INDEX IF NOT EXISTS idx_asignaciones_grupo ON asignaciones(grupo_id);
