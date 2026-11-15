export async function fetchAlertas(apiBase) {
  const r = await fetch(`${apiBase}/api/sabi`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudieron cargar alertas');
  return r.json();
}
export async function crearAlerta(apiBase, data) {
  const r = await fetch(`${apiBase}/api/sabi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('No se pudo crear alerta');
  return r.json();
}
export async function borrarAlerta(apiBase, id) {
  const r = await fetch(`${apiBase}/api/sabi/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) throw new Error('No se pudo eliminar');
}
