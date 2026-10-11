// Interfaz de Respaldo (exportar/importar) y Modo ahorro.
// Se monta dentro de la sección «Configuración» que ya existía.

import { storage, CLAVES } from '../storage.js';
import { el, hoy, descargarTexto, avisar } from '../utils.js';
import { aviso, tarjeta, boton, dialogo } from '../ui-kit.js';
import {
  construirRespaldo, datosAImportar, resumenRespaldo, validarRespaldo,
  decidirModoAhorro, conexionDelNavegador, aplicarModoAhorro, pesoRespaldo,
  NOMBRES_CLAVES,
} from './logica-datos.js';

const CLAVE_AHORRO = CLAVES.MODO_AHORRO || 'sistema.ahorro';

export async function montarDatos() {
  const raiz = document.getElementById('cb-datos-root');
  if (!raiz) return;

  let estadoAhorro = await storage.get(CLAVE_AHORRO, { modo: 'auto' });

  raiz.textContent = '';
  raiz.append(
    aviso(
      'Tus datos viven en este dispositivo',
      'Si borras los datos del navegador o cambias de teléfono, pierdes lo guardado. Exportá un respaldo de vez en cuando y guardalo en tu correo o en una nube.',
    ),
  );

  raiz.append(seccionAhorro(), seccionRespaldo());

  /* ---------------- Modo ahorro ---------------- */

  function seccionAhorro() {
    const conexion = conexionDelNavegador();
    const decision = decidirModoAhorro({
      saveData: conexion.saveData,
      efectivo: conexion.efectivo,
      guardado: estadoAhorro,
    });

    const contenido = [
      aviso(
        'Qué hace el modo ahorro',
        'Quita animaciones y transiciones para que el teléfono gaste menos batería y dibuje más rápido. No descarga nada menos ni bloquea funciones.',
      ),
    ];

    const grupo = el('div', { role: 'radiogroup', 'aria-label': 'Modo ahorro', style: { display: 'grid', gap: '.4rem', marginBottom: '.7rem' } });
    const opciones = [
      { valor: 'auto', texto: 'Automático', ayuda: 'Se enciende solo cuando tu navegador avisa que estás con datos limitados o conexión lenta.' },
      { valor: 'siempre', texto: 'Siempre encendido', ayuda: 'Útil si tu teléfono es lento o la batería se va rápido.' },
      { valor: 'nunca', texto: 'Nunca', ayuda: 'Mantener las animaciones aunque la conexión sea lenta.' },
    ];
    const actual = normalizarModo(estadoAhorro);
    opciones.forEach((op) => {
      const label = el('label', { style: { display: 'flex', gap: '.5rem', alignItems: 'flex-start', cursor: 'pointer', padding: '.35rem .1rem' } });
      const radio = el('input', { type: 'radio', name: 'cb-modo-ahorro', value: op.valor, style: { marginTop: '.18rem' } });
      radio.checked = actual === op.valor;
      radio.addEventListener('change', async () => {
        estadoAhorro = op.valor === 'auto' ? { modo: 'auto' } : { modo: op.valor, activo: op.valor === 'siempre' };
        await storage.set(CLAVE_AHORRO, estadoAhorro).catch(() => {});
        aplicarModoAhorro(document, decidirModoAhorro({
          saveData: conexion.saveData,
          efectivo: conexion.efectivo,
          guardado: estadoAhorro,
        }).activo);
        avisar('Modo ahorro actualizado.');
        raiz.textContent = '';
        raiz.append(
          aviso(
            'Tus datos viven en este dispositivo',
            'Si borras los datos del navegador o cambias de teléfono, pierdes lo guardado. Exportá un respaldo de vez en cuando y guardalo en tu correo o en una nube.',
          ),
          seccionAhorro(), seccionRespaldo(),
        );
      });
      const texto = el('span');
      texto.append(el('span', { style: { display: 'block', fontWeight: '600' } }, op.texto));
      texto.append(el('span', { style: { display: 'block', fontSize: '.78rem', color: 'var(--text-secondary)' } }, op.ayuda));
      label.append(radio, texto);
      grupo.append(label);
    });
    contenido.push(grupo);

    const detalleConexion = [];
    detalleConexion.push('Estado actual: ' + (decision.activo ? 'ahorro encendido' : 'ahorro apagado') + '. ' + decision.motivo);
    if (conexion.saveData) detalleConexion.push('Tu navegador avisa que estás usando datos móviles (ahorro de datos activado).');
    else if (conexion.efectivo) detalleConexion.push('Tipo de red detectada: ' + conexion.efectivo + '.');
    else detalleConexion.push('Tu navegador no informa el tipo de conexión, así que el automático no puede reaccionar solo.');
    contenido.push(el('p', { style: { margin: '0', fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' } }, detalleConexion.join(' ')));

    return tarjeta('Modo ahorro de datos y batería', contenido);
  }

  function normalizarModo(estado) {
    if (!estado || estado.modo === 'auto' || (!estado.modo && estado.activo === undefined)) return 'auto';
    if (estado.modo === 'siempre' || estado.activo === true) return 'siempre';
    return 'nunca';
  }

  /* ---------------- Respaldo ---------------- */

  function seccionRespaldo() {
    const acciones = el('div', { style: { display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginBottom: '.8rem' } });
    acciones.append(
      boton('Exportar respaldo (JSON)', 'primario', exportarRespaldo),
      boton('Importar respaldo', 'secundario', importarRespaldo),
    );
    return tarjeta('Respaldo de tus datos', [
      aviso(
        'Qué incluye el respaldo',
        'Materias y notas, horario, agenda, simulacros PAES, servicio social, comunicados, contactos de apoyo y sesiones de estudio. NO incluye tu cuenta ni tu contraseña.',
      ),
      acciones,
      el('input', {
        type: 'file', accept: 'application/json,.json', id: 'cb-respaldo-archivo',
        style: { display: 'none' }, 'aria-hidden': 'true', tabindex: '-1',
      }),
    ]);
  }

  async function exportarRespaldo() {
    let almacenamiento = {};
    try {
      const claves = await storage.keys();
      almacenamiento = {};
      for (const clave of claves) {
        almacenamiento[clave] = await storage.get(clave, undefined);
      }
    } catch (e) {
      avisar('No se pudo leer tus datos para exportar.', 'error');
      return;
    }
    const respaldo = construirRespaldo(almacenamiento, { fecha: hoy() });
    if (respaldo.cantidad === 0) {
      avisar('Todavía no hay datos que respaldar.', 'error');
      return;
    }
    const peso = pesoRespaldo(respaldo);
    descargarTexto(`cherrybomb-respaldo-${hoy()}.json`, JSON.stringify(respaldo, null, 2), 'application/json;charset=utf-8');
    avisar(`Respaldo descargado (${respaldo.cantidad} secciones, ${peso.kb} KB). Guardalo en un lugar seguro.`);
  }

  function importarRespaldo() {
    const input = document.getElementById('cb-respaldo-archivo');
    if (!input) return;
    input.value = '';
    input.onchange = () => {
      const archivo = input.files && input.files[0];
      if (!archivo) return;
      if (archivo.size > 5 * 1024 * 1024) {
        avisar('El archivo es demasiado grande para ser un respaldo.', 'error');
        return;
      }
      const lector = new FileReader();
      lector.onload = () => procesarArchivo(String(lector.result || ''));
      lector.onerror = () => avisar('No se pudo leer el archivo.', 'error');
      lector.readAsText(archivo);
    };
    input.click();
  }

  async function procesarArchivo(texto) {
    let obj;
    try {
      obj = JSON.parse(texto);
    } catch (e) {
      avisar('El archivo no es un JSON válido.', 'error');
      return;
    }
    const validacion = validarRespaldo(obj);
    if (!validacion.ok) {
      avisar(validacion.motivo, 'error');
      return;
    }
    const resumen = resumenRespaldo(obj);
    const contenido = [
      el('p', { style: { margin: '0 0 .6rem', fontSize: '.85rem', lineHeight: '1.5' } },
        'Este respaldo contiene:'),
    ];
    const ul = el('ul', { style: { listStyle: 'none', padding: '0', margin: '0 0 .7rem', display: 'grid', gap: '.3rem' } });
    resumen.lineas.forEach((l) => {
      ul.append(el('li', { style: { fontSize: '.82rem' } },
        `${NOMBRES_CLAVES[l.clave] || l.clave}: ${l.detalle}`));
    });
    contenido.push(ul);
    if (resumen.ignoradas.length > 0) {
      contenido.push(el('p', { style: { margin: '0 0 .7rem', fontSize: '.78rem', color: 'var(--text-secondary)' } },
        'Se ignorarán ' + resumen.ignoradas.length + ' sección(es) que esta versión no reconoce.'));
    }
    contenido.push(aviso(
      'Esto reemplaza lo que tienes ahora',
      'Al confirmar, los datos actuales de esas secciones se sobrescriben con los del archivo. Haz una copia de lo actual si te importa.',
      'aviso',
    ));

    const ok = await dialogo({
      titulo: '¿Restaurar este respaldo?',
      contenido,
      textoConfirmar: 'Restaurar',
    });
    if (!ok) return;

    const resultado = datosAImportar(obj);
    if (!resultado.ok) { avisar(resultado.motivo, 'error'); return; }
    let guardadas = 0;
    for (const clave of Object.keys(resultado.datos)) {
      try {
        await storage.set(clave, resultado.datos[clave]);
        guardadas += 1;
      } catch (e) { /* seguimos con las demás */ }
    }
    avisar(`Respaldo restaurado: ${guardadas} sección(es). Recargá la página para verlo todo.`);
  }
}

export default { montar: montarDatos };
