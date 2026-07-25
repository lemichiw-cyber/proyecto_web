-- =====================================================
-- FIX: Políticas RLS de perfiles (elimina recursión)
-- Ejecutá esto en el SQL Editor de Supabase
-- =====================================================

-- Eliminar todas las políticas existentes en perfiles
DROP POLICY IF EXISTS "Usuarios ven su propio perfil" ON perfiles;
DROP POLICY IF EXISTS "Usuarios crean su perfil" ON perfiles;
DROP POLICY IF EXISTS "Usuarios actualizan su perfil" ON perfiles;
DROP POLICY IF EXISTS "Usuarios actualizan su propio perfil" ON perfiles;
DROP POLICY IF EXISTS "Admin ve todos los perfiles" ON perfiles;

-- Políticas simples y seguras (sin recursión)
CREATE POLICY "select_own" ON perfiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "insert_own" ON perfiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "update_own" ON perfiles
  FOR UPDATE USING (auth.uid() = id);

-- Verificar que funcionan
SELECT 'Políticas RLS corregidas OK' AS resultado;
