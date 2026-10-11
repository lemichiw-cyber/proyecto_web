// Interfaz de Bienestar: estadísticas del Pomodoro, metas, rachas y apoyo.
//
// Sin comparaciones entre estudiantes y sin diagnósticos: aquí sólo hay
// datos personales, metas propias y contactos que registra el estudiante.

import { storage, CLAVES } from '../storage.js';
import { el, hoy, formatearFechaCorta, avisar, nuevoId } from '../utils.js';
import {
  aviso, tarjeta, vacio, boton, dialogoFormulario, confirmar,
} from '../ui-kit.js';
import {
  registrarSesion, resumenRango, serieDiaria, rachaActual, mejorRacha,
  avanceMetaSemanal, lunesDeLaSemana,
  agregarContacto, editarContacto, eliminarContacto, CONSEJOS_EJEMPLO,
} from './logica-bienestar.js';

const META_POR_DEFECTO = 300; // 5 horas por semana (ejemplo, lo decides tú).

export async function montarBienestar() {
  const raiz = document.getElementById('cb-bienestar-root');
  if (!raiz) return;

  let sesiones = await storage.list(CLAVES.ESTUDIO_SESIONES);
  let metaSemanal = await storage.get(CLAVES.METAS_SEMANALES, META_POR_DEFECTO);
  let contactos = await storage.list(CLAVES.CONTACTOS_APOYO);

  const cont = el('div');
  raiz.textContent = '';
  raiz.append(
    aviso(
      'Tu información no se comparte',
      'Esto es sólo para ti: aquí no hay comparaciones con otras personas ni diagnósticos. Sirve para ver cuánto estudias y recordar a quién pedir ayuda.',
    ),
    cont,
  );

  const guardarSesiones = () => storage.set(CLAVES.ESTUDIO_SESIONES, sesiones).catch(() => {});
  const guardarMeta = () => storage.set(CLAVES.METAS_SEMANALES, metaSemanal).catch(() => {});
  const guardarContactos = () => storage.set(CLAVES.CONTACTOS_APOYO, contactos).catch(() => {});

  /**
   * Hook que instala app.js en el Pomodoro: cada bloque de estudio que
   * termina se registra aquí. Es opcional: si la app no está abierta en
   * esa sección, no se guarda nada (no hay push).
   */
  if (typeof window !== 'undefined' && window.CherryBombBachillerato) {
    window.CherryBombBachillerato.registrarBloqueEstudio = async (minutos) => {
      const r = registrarSesion(sesiones, { fecha: hoy(), minutos, hora: '' });
      if (!r.ok) return;
      sesiones = r.sesiones;
      await guardarSesiones();
      // Repinta si la sección está visible.
      if (raiz.isConnected) pintar();
    };
  }

  function pintar() {
    cont.textContent = '';
    cont.append(
      seccionResumen(),
      seccionGrafica(),
      seccionMetas(),
      seccionContactos(),
      seccionConsejos(),
    );
  }

  /* ---------------- Resumen ---------------- */

  function seccionResumen() {
    const hoyTexto = hoy();
    const semana = lunesDeLaSemana(hoyTexto);
    const r = resumenRango(sesiones);
    const hoyR = resumenRango(sesiones, hoyTexto, hoyTexto);
    const semanaR = resumenRango(sesiones, semana, hoyTexto);
    const racha = rachaActual(sesiones, hoyTexto);
    const record = mejorRacha(sesiones);

    const filas = [
      ['Minutos estudiados hoy', `${hoyR.minutos} min (${hoyR.sesiones} sesión${hoyR.sesiones === 1 ? '' : 'es'})`],
      ['Esta semana (desde el lunes)', `${semanaR.minutos} min`],
      ['Total registrado', `${r.minutos} min en ${r.sesiones} sesiones`],
      ['Racha actual', `${racha} día${racha === 1 ? '' : 's'} seguido${racha === 1 ? '' : 's'}`],
      ['Tu mejor racha', `${record} día${record === 1 ? '' : 's'}`],
    ];
    const ul = el('ul', { style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.4rem' } });
    filas.forEach(([k, v]) => {
      const li = el('li', { style: { display: 'flex', justifyContent: 'space-between', gap: '.5rem', fontSize: '.85rem', borderBottom: '1px dashed var(--border)', padding: '.3rem 0' } });
      li.append(el('span', { style: { color: 'var(--text-secondary)' } }, k), el('span', { style: { fontWeight: '600' } }, v));
      ul.append(li);
    });
    return tarjeta('Tu estudio', [
      aviso('Cómo se cuentan los minutos', 'Los minutos salen del temporizador Pomodoro cuando terminas un bloque. Si recargas la página sin haber terminado el bloque, ese tiempo no se guarda.'),
      ul,
    ]);
  }

  /* ---------------- Gráfica ---------------- */

  function seccionGrafica() {
    const serie = serieDiaria(sesiones, hoy(), 7);
    const maximo = Math.max(...serie.map((d) => d.minutos), 1);
    const ancho = 100 / serie.length;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 40');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Minutos estudiados en los últimos 7 días: ' + serie.map((d) => `${formatearFechaCorta(d.fecha)}: ${d.minutos} minutos`).join(', '));
    svg.style.width = '100%';
    svg.style.height = '140px';
    svg.style.display = 'block';

    serie.forEach((d, i) => {
      const alto = d.minutos > 0 ? Math.max(1, (d.minutos / maximo) * 34) : 0;
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(i * ancho + ancho * 0.15));
      rect.setAttribute('width', String(ancho * 0.7));
      rect.setAttribute('y', String(36 - alto));
      rect.setAttribute('height', String(alto));
      rect.setAttribute('rx', '1');
      rect.setAttribute('fill', d.minutos > 0 ? 'var(--primary)' : 'var(--gray-100)');
      svg.append(rect);
      const txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', String(i * ancho + ancho / 2));
      txt.setAttribute('y', '39');
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '3');
      txt.setAttribute('fill', 'var(--text-secondary)');
      txt.textContent = formatearFechaCorta(d.fecha).split(' ')[0];
      svg.append(txt);
    });

    return tarjeta('Últimos 7 días', [
      svg,
      el('p', { style: { margin: '.5rem 0 0', fontSize: '.78rem', color: 'var(--text-secondary)' } },
        `Máximo de la semana: ${maximo} min. Cada barra es un día; no hay promedios de otros estudiantes ni rankings.`),
    ]);
  }

  /* ---------------- Metas ---------------- */

  function seccionMetas() {
    const semana = lunesDeLaSemana(hoy());
    const minutosSemana = resumenRango(sesiones, semana, hoy()).minutos;
    const avance = avanceMetaSemanal(metaSemanal, minutosSemana);

    const contenido = [];
    if (avance.sinMeta) {
      contenido.push(aviso('Sin meta todavía', 'Puedes ponerte una meta semanal de estudio. Es tuya: no la ve nadie más.', 'aviso'));
    } else {
      contenido.push(barraAvance(avance.avance));
      contenido.push(el('p', { role: 'status', style: { margin: '.5rem 0 .7rem' } },
        `${avance.avance}% · ${avance.minutos} de ${avance.meta} min · faltan ${avance.faltan} min`));
      if (avance.completo) contenido.push(aviso('¡Meta cumplida!', 'Ya llevas esta semana completa. Si quieres, sube un poco la meta.', 'ok'));
    }
    contenido.push(boton('Cambiar mi meta', 'secundario', dialogoMeta));
    return tarjeta('Meta semanal', contenido);
  }

  /* ---------------- Contactos de apoyo ---------------- */

  function seccionContactos() {
    const contenido = [
      aviso('Personas de confianza', 'Guarda aquí a quien puedes hablar cuando algo se ponga difícil. Estos datos no salen de tu teléfono ni se envían a ningún servidor.'),
    ];
    if (contactos.length === 0) {
      contenido.push(vacio('Aún no registras a nadie. Piensa en una persona adulta de confianza: familia, vecina, orientador del centro…'));
    } else {
      const ul = el('ul', { class: 'cb-lista-lista', style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.5rem' } });
      contactos.forEach((c) => {
        const li = el('li', { class: 'cb-lista-item', style: { border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '.5rem .6rem' } });
        li.append(
          el('p', { style: { margin: '0 0 .2rem', fontWeight: '600' } }, c.nombre),
          el('p', { style: { margin: '.15rem 0', fontSize: '.82rem' } }, 'Contacto: ' + c.telefono),
        );
        if (c.relacion) li.append(el('p', { style: { margin: '.15rem 0', fontSize: '.78rem', color: 'var(--text-secondary)' } }, 'Relación: ' + c.relacion));
        const acciones = el('div', { style: { display: 'flex', gap: '.4rem', marginTop: '.4rem', flexWrap: 'wrap' } });
        acciones.append(
          boton('Editar', 'secundario', () => dialogoContacto(c), { 'aria-label': 'Editar el contacto ' + c.nombre }),
          boton('Eliminar', 'peligro', () => borrarContacto(c), { 'aria-label': 'Eliminar el contacto ' + c.nombre }),
        );
        li.append(acciones);
        ul.append(li);
      });
      contenido.push(ul);
    }
    contenido.push(boton('+ Agregar contacto', 'primario', () => dialogoContacto()));
    return tarjeta('A quién pedirle ayuda', contenido);
  }

  /* ---------------- Consejos ---------------- */

  function seccionConsejos() {
    const ul = el('ul', { style: { listStyle: 'none', padding: '0', margin: '0', display: 'grid', gap: '.4rem' } });
    CONSEJOS_EJEMPLO.forEach((c) => {
      ul.append(el('li', { style: { fontSize: '.85rem', lineHeight: '1.5', padding: '.3rem 0', borderBottom: '1px dashed var(--border)' } }, '• ' + c));
    });
    return tarjeta('Ideas para el día a día', [
      aviso('Esto no es consejo médico', 'Son ideas generales de hábitos. Si algo te pesa mucho o varios días seguidos, habla con un adulto de confianza o pregunta por la orientación de tu centro.', 'aviso'),
      ul,
    ]);
  }

  /* ---------------- Diálogos ---------------- */

  async function dialogoMeta() {
    const { confirmado, valores } = await dialogoFormulario('Meta semanal de estudio', [
      { clave: 'meta', etiqueta: 'Minutos que quieres estudiar por semana', tipo: 'number', valor: String(metaSemanal), min: 0, max: 10080, paso: '15', inputmode: 'numeric', ayuda: 'Ejemplo: 300 (que son 5 horas). Usa 0 si no quieres meta.' },
    ]);
    if (!confirmado) return;
    const m = Number(valores.meta);
    if (!Number.isFinite(m) || m < 0 || m > 10080) { avisar('La meta debe estar entre 0 y 10080 minutos.', 'error'); return; }
    metaSemanal = m;
    await guardarMeta();
    pintar();
  }

  async function dialogoContacto(actual) {
    const { confirmado, valores } = await dialogoFormulario(actual ? 'Editar contacto' : 'Nuevo contacto', [
      { clave: 'nombre', etiqueta: 'Nombre', valor: actual ? actual.nombre : '', placeholder: 'Ej: Mamá', requerido: true },
      { clave: 'telefono', etiqueta: 'Teléfono o forma de contacto', valor: actual ? actual.telefono : '', placeholder: 'Ej: 7000-0000', requerido: true },
      { clave: 'relacion', etiqueta: 'Relación (opcional)', valor: actual ? actual.relacion : '', placeholder: 'Ej: familia, amistad, orientación' },
    ], actual ? 'Guardar cambios' : 'Guardar');
    if (!confirmado) return;

    const r = actual
      ? editarContacto(contactos, actual.id, valores)
      : agregarContacto(contactos, valores, { id: nuevoId });
    if (!r.ok) { avisar(r.motivo, 'error'); return; }
    contactos = r.lista;
    await guardarContactos();
    avisar('Contacto guardado.');
    pintar();
  }

  async function borrarContacto(c) {
    const ok = await confirmar('Eliminar contacto', 'Se va a borrar a «' + c.nombre + '» de tu lista.', 'Borrar');
    if (!ok) return;
    const r = eliminarContacto(contactos, c.id);
    if (!r.ok) { avisar(r.motivo, 'error'); return; }
    contactos = r.lista;
    await guardarContactos();
    pintar();
  }

  function barraAvance(avance) {
    const relleno = el('div', { style: { width: avance + '%', height: '100%', background: 'var(--primary)', borderRadius: 'var(--radius-full)' } });
    const barra = el('div', {
      role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(avance),
      style: { height: '.6rem', background: 'var(--gray-100)', borderRadius: 'var(--radius-full)', overflow: 'hidden' },
    });
    barra.append(relleno);
    return barra;
  }

  pintar();
}

export default { montar: montarBienestar };
