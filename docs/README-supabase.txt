Estos archivos SQL son referencia histórica para quien quiera
reactivar sincronización en la nube con Supabase:

1. Crear proyecto en supabase.com
2. Ejecutar supabase-schema.sql en el SQL Editor
3. Revisar políticas RLS (ver supabase-fix-rls.sql)
4. Definir VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env
5. Restaurar la capa remota en src/data.js

La app funciona 100% sin esto: todos los datos viven en localStorage.