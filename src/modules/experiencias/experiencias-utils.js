export async function fetchExperiencias(apiBase) {
  const r = await fetch(`${apiBase}/api/experiencias`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudieron cargar experiencias');
  return r.json();
}
export async function crearExperiencia(apiBase, data) {
  const r = await fetch(`${apiBase}/api/experiencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('No se pudo crear');
  return r.json();
}
export async function borrarExperiencia(apiBase, id) {
  const r = await fetch(`${apiBase}/api/experiencias/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo eliminar');
}
