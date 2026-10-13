// Interfaz de Comunicados/eventos y Orientación vocacional.

import { storage, CLAVES } from '../storage.js';
import { el, hoy, avisar, nuevoId } from '../utils.js';
import {
  aviso, tarjeta, vacio, boton, campo, selector, dialogoFormulario, confirmar,
} from '../ui-kit.js';
import {
  agregarComunicado, editarComunicado, eliminarComunicado,
  proximosComunicados, comunicadosVencidos, diasRestantes, filtrarComunicados,
  buscarCarreras, areasAfinas, CARRERAS_EJEMPLO, FUENTES_OFICIALES,
} from './logica-centro.js';

const TIPOS = [
  { valor: 'comunicado', texto: 'Comunicado' },
  { valor: 'evento', texto: 'Evento' },
  { valor: 'tarea', texto: 'Tarea' },
  { valor: 'examen', texto: 'Examen' },
  { valor: 'otro', texto: 'Otro' },
];
const ETIQUETAS = Object.fromEntries(TIPOS.map((t) => [t.valor, t.texto]));

export async function montarCentro() {
  const raiz = document.getElementById('cb-centro-root');
  if (!raiz) return;

  let comunicados = await storage.list(CLAVES.COMUNICADOS);
  let filtroTexto = '';
  let filtroTipo = '';

  const cont = el('div');
  raiz.textContent = '';
  raiz.append(
    aviso(
      'Tus avisos se quedan en tu teléfono',
      'En Orientación vocacional verás enlaces para verificar: siempre confirma requisitos, becas y duración en la fuente oficial, porque pueden cambiar.',
    ),
    cont,
  );

  const guardarComunicados = () => storage.set(CLAVES.COMUNICADOS, comunicados).catch(() => {});

  // Pestañas accesibles (Izquierda/Derecha con flechas).
  const pestañas = crearPestañas([
    { id: 'comunicados', texto: 'Comunicados y eventos', pintar: pintarComunicados },
    { id: 'orientacion', texto: 'Orientación vocacional', pintar: pintarOrientacion },
  ]);
  cont.append(pestañas.raiz);

  /* ---------------- Pestañas ---------------- */

  function crearPestañas(defs) {
    const barra = el('div', { class: 'cb-tabs', role: 'tablist', style: { display: 'flex', gap: '.3rem', flexWrap: 'wrap', marginBottom: '.8rem' } });
    const panel = el('div', { role: 'tabpanel' });
    const botones = defs.map((d, i) => {
      const b = el('button', {
        type: 'button', class: 'cb-tab', role: 'tab',
        'aria-selected': i === 0 ? 'true' : 'false',
        'aria-controls': 'cb-panel-' + d.id,
        id: 'cb-tab-' + d.id,
        tabindex: i === 0 ? '0' : '-1',
        style: { padding: '.45rem .8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', font: 'inherit', cursor: 'pointer' },
      }, d.texto);
      b.addEventListener('click', () => activar(i));
      b.addEventListener('keydown', (ev) => {
        if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
        ev.preventDefault();
        const sig = ev.key === 'ArrowRight' ? (i + 1) % defs.length : (i - 1 + defs.length) % defs.length;
        activar(sig);
        botones[sig].focus();
      });
      barra.append(b);
      return b;
    });
    panel.id = 'cb-panel-' + defs[0].id;
    function activar(i) {
      botones.forEach((b, j) => {
        b.setAttribute('aria-selected', i === j ? 'true' : 'false');
        b.tabIndex = i === j ? 0 : -1;
      });
      panel.setAttribute('aria-labelledby', 'cb-tab-' + defs[i].id);
      panel.textContent = '';
      defs[i].pintar(panel);
    }
    activar(0);
    const caja = el('div');
    caja.append(barra, panel);
    return { raiz: caja, activar };
  }

  /* ---------------- Comunicados ---------------- */

  function pintarComunicados(panel) {
    panel.textContent = '';
    const cabecera = tarjeta('Comunicados y eventos', [
      aviso('Para no olvidar nada', 'Escribe aquí los avisos del centro: fechas de exámenes, reuniones, entregas. Sólo tú los ves.'),
      boton('+ Agregar comunicado', 'primario', () => dialogoComunicado()),
    ]);
    panel.append(cabecera);

    // Filtros.
    const filtros = tarjeta('Filtrar', [
      campo({
        etiqueta: 'Buscar por texto', valor: filtroTexto,
        placeholder: 'Ej: examen', ayuda: 'Busca en el título y el detalle.',
        onChange: (e) => { filtroTexto = e.target.value; pintarResultados(); },
      }),
      selector({
        etiqueta: 'Tipo', opciones: [{ valor: '', texto: 'Todos' }].concat(TIPOS), valor: filtroTipo,
        onChange: (e) => { filtroTipo = e.target.value; pintarResultados(); },
      }),
    ]);
    panel.append(filtros);

    const caja = el('div');
    panel.append(caja);

    function pintarResultados() {
      caja.textContent = '';
      const hoyTexto = hoy();
      const filtrados = filtrarComunicados(comunicados, { texto: filtroTexto, tipo: filtroTipo });

      if (comunicados.length === 0) {
        caja.append(vacio('No hay comunicados todavía. Agrega el próximo examen, entrega o reunión para no olvidarlo.'));
        return;
      }
      if (filtrados.length === 0) {
        caja.append(vacio('Ningún comunicado coincide con el filtro.', 'Quitar filtros', () => {
          filtroTexto = '';
          filtroTipo = '';
          pintarComunicados(panel);
        }));
        return;
      }

      const proximos = proximosComunicados(filtrados, hoyTexto);
      const pasados = comunicadosVencidos(filtrados, hoyTexto);
      const sinFecha = filtrados.filter((c) => !c.fecha);

      if (proximos.length > 0) caja.append(tituloGrupo('Próximos'), listaComunicados(proximos, hoyTexto));
      caja.append(tituloGrupo('Sin fecha'), listaComunicados(sinFecha, hoyTexto));
      if (pasados.length > 0) caja.append(tituloGrupo('Ya pasaron'), listaComunicados(pasados, hoyTexto));
    }

    function tituloGrupo(texto) {
      return el('h3', { class: 'cb-titulo-grupo', style: { margin: '1rem 0 .5rem', fontSize: '.95rem' } }, texto);
    }

    function listaComunicados(lista, hoyTexto) {
      if (lista.length === 0) {
        return el('p', { style: { margin: '.2rem 0', color: 'var(--text-secondary)', fontSize: '.82rem' } }, '—');
      }
      const ul = el('ul', { class: 'cb-lista-lista', style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.6rem' } });
      lista.forEach((c) => {
        const li = el('li', { class: 'cb-lista-item', style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.6rem' } });
        li.append(el('p', { class: 'cb-enc-item', style: { margin: '0 0 .2rem', fontWeight: '600' } },
          (ETIQUETAS[c.tipo] || 'Otro') + ' · ' + c.titulo));
        if (c.detalle) li.append(el('p', { style: { margin: '.2rem 0', fontSize: '.85rem' } }, c.detalle));

        const dias = diasRestantes(c.fecha, hoyTexto);
        let textoMeta = 'Sin fecha';
        if (c.fecha) {
          if (dias === 0) textoMeta = 'Fecha: ' + c.fecha + ' · ¡es hoy!';
          else if (dias > 0) textoMeta = 'Fecha: ' + c.fecha + ' · faltan ' + dias + ' día' + (dias === 1 ? '' : 's');
          else textoMeta = 'Fecha: ' + c.fecha + ' · pasó hace ' + Math.abs(dias) + ' día' + (dias === -1 ? '' : 's');
        }
        li.append(el('p', { class: 'cb-meta-fila', style: { margin: '.3rem 0', fontSize: '.78rem', color: 'var(--text-secondary)' } }, textoMeta));

        if (c.enlace) {
          const a = el('a', { href: c.enlace, target: '_blank', rel: 'noopener noreferrer', style: { fontSize: '.82rem' } }, 'Ver enlace');
          li.append(a);
        }

        const acciones = el('div', { style: { display: 'flex', gap: '.4rem', marginTop: '.4rem', flexWrap: 'wrap' } });
        acciones.append(
          boton('Editar', 'secundario', () => dialogoComunicado(c), { 'aria-label': 'Editar ' + c.titulo }),
          boton('Eliminar', 'peligro', () => borrarComunicado(c), { 'aria-label': 'Eliminar ' + c.titulo }),
        );
        li.append(acciones);
        ul.append(li);
      });
      return ul;
    }

    pintarResultados();
  }

  async function dialogoComunicado(actual) {
    const { confirmado, valores } = await dialogoFormulario(actual ? 'Editar comunicado' : 'Nuevo comunicado', [
      { clave: 'titulo', etiqueta: 'Título', valor: actual ? actual.titulo : '', placeholder: 'Ej: Examen de matemática', requerido: true },
      { clave: 'tipo', etiqueta: 'Tipo', tipo: 'selector', opciones: TIPOS, valor: actual ? actual.tipo : 'comunicado' },
      { clave: 'fecha', etiqueta: 'Fecha (opcional)', tipo: 'date', valor: actual ? actual.fecha : '' },
      { clave: 'detalle', etiqueta: 'Detalle (opcional)', tipo: 'area', valor: actual ? actual.detalle : '', placeholder: 'Ej: capítulo 4, aula 3', filas: 3 },
      { clave: 'enlace', etiqueta: 'Enlace (opcional)', tipo: 'url', valor: actual ? actual.enlace : '', placeholder: 'https://…' },
    ], actual ? 'Guardar cambios' : 'Guardar');
    if (!confirmado) return;

    const r = actual
      ? editarComunicado(comunicados, actual.id, valores)
      : agregarComunicado(comunicados, valores, { id: nuevoId });
    if (!r.ok) { avisar(r.motivo, 'error'); return; }
    comunicados = r.lista;
    await guardarComunicados();
    avisar('Comunicado guardado.');
    pintarComunicados(panelActual());
  }

  async function borrarComunicado(c) {
    const ok = await confirmar('Eliminar comunicado', 'Se va a borrar «' + c.titulo + '».', 'Borrar');
    if (!ok) return;
    const r = eliminarComunicado(comunicados, c.id);
    if (!r.ok) { avisar(r.motivo, 'error'); return; }
    comunicados = r.lista;
    await guardarComunicados();
    avisar('Comunicado borrado.');
    pintarComunicados(panelActual());
  }

  /* ---------------- Orientación vocacional ---------------- */

  function pintarOrientacion(panel) {
    panel.textContent = '';
    panel.append(tarjeta('¿Qué te gusta hacer?', [
      aviso('Guía, no diagnóstico', 'Esto es una guía para explorar áreas, NO un examen vocacional. La decisión es tuya y la conversas con tu familia, orientador o docentes.'),
      campo({
        etiqueta: 'Cuéntanos qué te gusta o en qué se te da bien',
        valor: '', placeholder: 'Ej: me gustan las computadoras, ayudar a la gente, los números…',
        ayuda: 'Escribe con tus palabras; no hay respuestas correctas ni incorrectas.',
        onChange: (e) => pintarAfinidades(e.target.value),
      }),
      el('div', { id: 'cb-caja-afinidades' }),
    ]));

    // Fuentes oficiales.
    const ulF = el('ul', { class: 'cb-lista-lista', style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.5rem' } });
    FUENTES_OFICIALES.forEach((f) => {
      const li = el('li', { class: 'cb-lista-item', style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.5rem .6rem' } });
      li.append(
        el('a', { href: f.url, target: '_blank', rel: 'noopener noreferrer', style: { fontWeight: '600' } }, f.nombre),
        el('p', { class: 'cb-meta-fila', style: { margin: '.25rem 0 0', fontSize: '.78rem', color: 'var(--text-secondary)' } }, 'Verifica aquí la información oficial.'),
      );
      ulF.append(li);
    });
    panel.append(tarjeta('Fuentes oficiales para verificar', [
      aviso('Antes de inscribirte', 'Confirma requisitos, fechas y costos en estas fuentes. Si algún enlace no abre, búscalo en el buscador con el nombre completo de la institución.', 'aviso'),
      ulF,
    ]));

    // Catálogo de carreras.
    const cajaCarreras = el('div');
    const campoBuscar = campo({
      etiqueta: 'Buscar carrera o área', valor: '', placeholder: 'Ej: medicina',
      ayuda: 'Busca en la lista de ejemplo.',
      onChange: (e) => pintarCarreras(e.target.value),
    });
    panel.append(tarjeta('Carreras para explorar', [
      aviso('Lista de ejemplo', 'Las condiciones (duración, requisitos, sede, becas) las fija cada institución: usa el enlace para verificar antes de decidir.'),
      campoBuscar,
      cajaCarreras,
    ]));

    function pintarCarreras(texto) {
      cajaCarreras.textContent = '';
      const grupos = buscarCarreras(CARRERAS_EJEMPLO, texto);
      if (grupos.length === 0) {
        cajaCarreras.append(vacio('No encontramos esa carrera en la lista de ejemplo. Prueba con otra palabra o revisa las fuentes oficiales.'));
        return;
      }
      grupos.forEach((g) => {
        cajaCarreras.append(el('h3', { class: 'cb-titulo-grupo', style: { margin: '.9rem 0 .4rem', fontSize: '.95rem' } }, g.area));
        const ul = el('ul', { class: 'cb-lista-lista', style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.5rem' } });
        g.carreras.forEach((c) => {
          const li = el('li', { class: 'cb-lista-item', style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.5rem .6rem' } });
          li.append(
            el('p', { class: 'cb-enc-item', style: { margin: '0 0 .2rem', fontWeight: '600' } }, c.nombre),
            el('p', { style: { margin: '.2rem 0', fontSize: '.85rem' } }, 'Puedes verificar información en: ' + c.donde),
            el('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer', style: { fontSize: '.82rem' } }, 'Ir a la fuente oficial para verificar'),
          );
          ul.append(li);
        });
        cajaCarreras.append(ul);
      });
    }
    pintarCarreras('');
  }

  function pintarAfinidades(texto) {
    const caja = document.getElementById('cb-caja-afinidades');
    if (!caja) return;
    caja.textContent = '';
    const areas = areasAfinas([texto]);
    if (areas.length === 0) return;
    caja.append(el('h3', { class: 'cb-titulo-grupo', style: { margin: '.9rem 0 .4rem', fontSize: '.95rem' } }, 'Áreas que podrían interesarte'));
    const ul = el('ul', { class: 'cb-lista-lista', style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.4rem' } });
    areas.forEach((a) => {
      ul.append(el('li', { class: 'cb-lista-item', style: { fontSize: '.85rem' } },
        a.area + ' · afinidad aproximada ' + a.afinidad + '%'));
    });
    caja.append(ul);
    caja.append(el('p', { class: 'cb-meta-fila', style: { margin: '.5rem 0 0', fontSize: '.78rem', color: 'var(--text-secondary)' } },
      'La afinidad es orientativa y no garantiza nada. Explora, pregunta y verifica.'));
  }

  // Referencia al panel activo, para repintar la pestaña de comunicados
  // después de guardar o borrar.
  const panelRef = cont.querySelector('[role="tabpanel"]');
  function panelActual() { return panelRef; }
}

export default { montar: montarCentro };
