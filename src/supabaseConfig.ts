// Configuración de Supabase
// Crea un archivo .env con:
//   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
//   VITE_SUPABASE_ANON_KEY=tu_clave_publica
// Si no existen, usa las de abajo (proyecto INCOA).

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://slxqmvizjulyrwrwserw.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Le4XynWhIyZFicTqM2rwjQ_QDRBwxL5';
