// Interfaz del Modo ahorro. Se monta dentro de «Configuración».
//
// El export/importar de datos vive ahora en la sección «Respaldos»
// (src/backup/backup.js), que es la que usa todo el resto de la app.
// Acá queda sólo esta tarjeta, que es la parte propia de bachillerato.

import { storage, CLAVES } from '../storage.js';
import { el, avisar } from '../utils.js';
import { tarjeta, aviso } from '../ui-kit.js';
import {
  decidirModoAhorro,
  conexionDelNavegador,
  aplicarModoAhorro,
  normalizarModo,
} from './logica-ahorro.js';

const CLAVE_AHORRO = CLAVES.MODO_AHORRO || 'sistema.ahorro';

const OPCIONES = [
  { valor: 'auto', texto: 'Automático', ayuda: 'Se enciende solo cuando tu navegador avisa que estás con datos limitados o conexión lenta.' },
  { valor: 'siempre', texto: 'Siempre encendido', ayuda: 'Útil si tu teléfono es lento o la batería se va rápido.' },
  { valor: 'nunca', texto: 'Nunca', ayuda: 'Mantener las animaciones aunque la conexión sea lenta.' },
];

export async function montarAhorro() {
  const raiz = document.getElementById('cb-datos-root');
  if (!raiz) return;

  let estadoAhorro = await storage.get(CLAVE_AHORRO, { modo: 'auto' });
  const conexion = conexionDelNavegador();

  function pintar() {
    raiz.textContent = '';
    raiz.append(seccionAhorro());
  }

  function seccionAhorro() {
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

    const grupo = el('div', {
      role: 'radiogroup',
      'aria-label': 'Modo ahorro',
      style: { display: 'grid', gap: '.4rem', marginBottom: '.7rem' },
    });
    const actual = normalizarModo(estadoAhorro);

    OPCIONES.forEach((op) => {
      const label = el('label', {
        style: { display: 'flex', gap: '.5rem', alignItems: 'flex-start', cursor: 'pointer', padding: '.35rem .1rem' },
      });
      const radio = el('input', {
        type: 'radio',
        name: 'cb-modo-ahorro',
        value: op.valor,
        style: { marginTop: '.18rem' },
      });
      radio.checked = actual === op.valor;

      radio.addEventListener('change', async () => {
        estadoAhorro = op.valor === 'auto'
          ? { modo: 'auto' }
          : { modo: op.valor, activo: op.valor === 'siempre' };
        await storage.set(CLAVE_AHORRO, estadoAhorro).catch(() => {});
        aplicarModoAhorro(document, decidirModoAhorro({
          saveData: conexion.saveData,
          efectivo: conexion.efectivo,
          guardado: estadoAhorro,
        }).activo);
        avisar('Modo ahorro actualizado.');
        pintar();
        // Devuelve el foco a la opción recién elegida para que se pueda
        // seguir moviendo con el teclado.
        const deNuevo = raiz.querySelector('input[name="cb-modo-ahorro"][value="' + op.valor + '"]');
        if (deNuevo && typeof deNuevo.focus === 'function') deNuevo.focus();
      });

      const texto = el('span');
      texto.append(el('span', { style: { display: 'block', fontWeight: '600' } }, op.texto));
      texto.append(el('span', {
        style: { display: 'block', fontSize: '.78rem', color: 'var(--text-secondary)' },
      }, op.ayuda));
      label.append(radio, texto);
      grupo.append(label);
    });
    contenido.push(grupo);

    const detalle = [];
    detalle.push('Estado actual: ' + (decision.activo ? 'ahorro encendido' : 'ahorro apagado') + '. ' + decision.motivo);
    if (conexion.saveData) detalle.push('Tu navegador avisa que estás usando datos móviles (ahorro de datos activado).');
    else if (conexion.efectivo) detalle.push('Tipo de red detectada: ' + conexion.efectivo + '.');
    else detalle.push('Tu navegador no informa el tipo de conexión, así que el automático no puede reaccionar solo.');
    contenido.push(el('p', {
      style: { margin: '0', fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' },
    }, detalle.join(' ')));

    return tarjeta('Modo ahorro de datos y batería', contenido);
  }

  pintar();
}

export default { montar: montarAhorro };
