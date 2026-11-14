export async function fetchAsistencias(apiBase) {
  const r = await fetch(`${apiBase}/api/aulas/asistencia`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudieron cargar asistencias');
  return r.json();
}
