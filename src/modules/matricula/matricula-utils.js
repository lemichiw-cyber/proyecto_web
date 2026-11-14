export async function fetchSolicitudes(apiBase) {
  const r = await fetch(`${apiBase}/api/matricula/solicitudes`, { credentials: 'include' });
  if (!r.ok) throw new Error('No se pudieron cargar las solicitudes');
  return r.json();
}
export async function crearSolicitud(apiBase, data) {
  const r = await fetch(`${apiBase}/api/matricula/solicitudes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  if (!r.ok) throw new Error('No se pudo crear la solicitud');
  return r.json();
}
export async function actualizarSolicitud(apiBase, id, estado) {
  const r = await fetch(`${apiBase}/api/matricula/solicitudes/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ estado })
  });
  if (!r.ok) throw new Error('No se pudo actualizar');
  return r.json();
}
export async function borrarSolicitud(apiBase, id) {
  const r = await fetch(`${apiBase}/api/matricula/solicitudes/${id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  if (!r.ok) throw new Error('No se pudo eliminar');
}
