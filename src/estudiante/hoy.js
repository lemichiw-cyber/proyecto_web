/* ===================================================================
   hoy.js — pantalla de inicio "Hoy" del estudiante.
   Se monta dentro de #inicio-hoy (sección INICIO). Pinta con
   createElement + textContent: ningún dato del usuario pasa por
   innerHTML. Mobile-first, objetivos de 44px y sin scroll horizontal.
   =================================================================== */

import './estudiante.css';
import { construirModeloHoy, textoMinutos } from './modelo-hoy.js';
import { datos } from './datos.js';

/* ---------- mini helper DOM (sin innerHTML) ---------- */
function el(tag, clases, texto) {
  var n = document.createElement(tag);
  if (clases) n.className = clases;
  if (texto !== undefined && texto !== null) n.textContent = String(texto);
  return n;
}

function boton(texto, alPulsar, clases) {
  var b = el('button', 'btn ' + (clases || 'btn-outline') + ' hoy-btn', texto);
  b.type = 'button';
  b.addEventListener('click', alPulsar);
  return b;
}

function irA(app) {
  if (typeof window !== 'undefined' && typeof window.mostrarApp === 'function') {
    window.mostrarApp(app);
  }
}

var contenedor = null;
var reloj = null;

export function montarHoy() {
  if (contenedor) return contenedor;
  contenedor = document.getElementById('inicio-hoy');
  if (!contenedor) return null;
  contenedor.classList.remove('hidden');
  renderHoy();
  // La cuenta regresiva y las clases cambian con la hora: refresco cada
  // minuto solo si la pantalla está visible (coste casi nulo).
  if (reloj) clearInterval(reloj);
  reloj = setInterval(function () {
    if (contenedor && !contenedor.classList.contains('hidden')) renderHoy();
  }, 60000);
  return contenedor;
}

export function renderHoy() {
  if (!contenedor) contenedor = document.getElementById('inicio-hoy');
  if (!contenedor) return;
  var m = construirModeloHoy({});

  // Vaciar sin innerHTML
  while (contenedor.firstChild) contenedor.removeChild(contenedor.firstChild);

  var raiz = el('section', 'hoy-panel');
  raiz.setAttribute('aria-labelledby', 'hoy-titulo');

  raiz.appendChild(cabecera(m));
  raiz.appendChild(gridDeTarjetas(m));
  raiz.appendChild(el('p', 'hoy-aviso', 'Todo se guarda en este dispositivo y funciona sin datos móviles.'));

  contenedor.appendChild(raiz);

  // Escucha eventos que cambian lo que se ve (Pomodoro, tareas nuevas)
  escucharEventos();
}

/* ---------- encabezado ---------- */
function cabecera(m) {
  var caja = el('div', 'hoy-saludo');
  var izq = el('div', 'hoy-saludo-texto');
  izq.appendChild(el('p', 'hoy-fecha', m.diaNombre + ' ' + m.fechaISO.split('-').reverse().join('/')));
  var h2 = el('h2', 'hoy-titulo', 'Hoy');
  h2.id = 'hoy-titulo';
  izq.appendChild(h2);
  caja.appendChild(izq);

  var esInvitado = !(typeof window !== 'undefined' && window.usuarioActual);
  if (esInvitado) {
    var chip = el('span', 'hoy-chip', 'Modo invitado');
    chip.title = 'Sin cuenta y sin contraseña';
    caja.appendChild(chip);
  }
  return caja;
}

/* ---------- tarjetas ---------- */
function gridDeTarjetas(m) {
  var ul = el('ul', 'hoy-grid');
  ul.appendChild(tarjetaClases(m));
  ul.appendChild(tarjetaTareas(m));
  ul.appendChild(tarjetaEstudio(m));
  if (m.evaluacion) ul.appendChild(tarjetaEvaluacion(m));
  return ul;
}

function tarjeta(titulo, contenido) {
  var li = el('li', 'hoy-card');
  li.appendChild(el('h3', 'hoy-card-titulo', titulo));
  li.appendChild(contenido);
  return li;
}

function tarjetaClases(m) {
  var cuerpo = el('div', '');
  if (m.esFinDeSemana) {
    cuerpo.appendChild(el('p', 'hoy-vacio', 'Fin de semana: sin clases 🎉'));
  } else if (m.clases.length === 0) {
    cuerpo.appendChild(el('p', 'hoy-vacio', 'Todavía no cargaste tu horario.'));
    cuerpo.appendChild(boton('+ Agregar mi horario', function () { irA('horario'); }, 'btn-primary'));
  } else {
    var lista = el('ul', 'hoy-lista');
    m.clases.forEach(function (c) {
      var esProxima = !!(m.proximaClase && c.hora === m.proximaClase.hora && c.materia === m.proximaClase.materia);
      var li = el('li', 'hoy-fila' + (esProxima ? ' is-proxima' : ''));
      li.appendChild(el('span', 'hoy-hora', c.hora || '—'));
      li.appendChild(el('span', 'hoy-materia', c.materia));
      if (c.tipo !== 'clase') {
        li.appendChild(el('span', 'hoy-chip-chico', c.tipo === 'receso' ? 'Receso' : 'Almuerzo'));
      } else if (esProxima) {
        li.appendChild(el('span', 'hoy-chip-chico is-ahora', 'Ahora'));
      }
      lista.appendChild(li);
    });
    cuerpo.appendChild(lista);
    var pie = el('div', 'hoy-pie');
    pie.appendChild(boton('Ver horario completo', function () { irA('horario'); }));
    cuerpo.appendChild(pie);
  }
  return tarjeta('Clases de hoy', cuerpo);
}

function tarjetaTareas(m) {
  var cuerpo = el('div', '');
  if (m.tareas.length === 0) {
    cuerpo.appendChild(el('p', 'hoy-vacio', 'Nada por entregar hoy ni mañana.'));
  } else {
    var lista = el('ul', 'hoy-lista');
    m.tareas.forEach(function (t) {
      var li = el('li', 'hoy-fila' + (t.hecha ? ' is-hecha' : ''));
      var casilla = document.createElement('input');
      casilla.type = 'checkbox';
      casilla.className = 'hoy-check';
      casilla.checked = !!t.hecha;
      casilla.id = 'hoy-t-' + t.id;
      casilla.setAttribute('aria-label', 'Marcar como hecha: ' + t.titulo);
      // Solo las tareas personales se marcan desde aquí; las del docente
      // se entregan en la sección Tareas.
      casilla.disabled = !t.personal;
      casilla.addEventListener('change', function () {
        datos.alternarMisTarea(t.id);
        renderHoy();
      });
      var etiqueta = el('label', 'hoy-label', t.titulo);
      etiqueta.setAttribute('for', casilla.id);
      li.appendChild(casilla);
      var centro = el('span', 'hoy-label-caja');
      centro.appendChild(etiqueta);
      if (t.materia) centro.appendChild(el('span', 'hoy-materia-chica', t.materia));
      li.appendChild(centro);
      li.appendChild(el('span', 'hoy-tag' + (t.cuando === 'Hoy' ? ' is-hoy' : ''), t.cuando));
      lista.appendChild(li);
    });
    cuerpo.appendChild(lista);
    var pie = el('div', 'hoy-pie');
    pie.appendChild(boton('+ Nueva tarea', function () {
      if (typeof window !== 'undefined' && typeof window.abrirCapturaRapida === 'function') {
        window.abrirCapturaRapida();
      } else {
        irA('tareas');
      }
    }, 'btn-primary'));
    cuerpo.appendChild(pie);
  }
  return tarjeta('Tareas de hoy y mañana', cuerpo);
}

function tarjetaEstudio(m) {
  var cuerpo = el('div', 'hoy-estudio');
  var num = el('p', 'hoy-num', textoMinutos(m.minutosEstudio));
  num.setAttribute('aria-label', 'Tiempo estudiado hoy: ' + textoMinutos(m.minutosEstudio));
  cuerpo.appendChild(num);
  cuerpo.appendChild(el('p', 'hoy-leyenda', 'estudiados hoy'));
  cuerpo.appendChild(boton('Estudiar ahora', function () { irA('estudio'); }, 'btn-primary'));
  return tarjeta('Tiempo de estudio', cuerpo);
}

function tarjetaEvaluacion(m) {
  var e = m.evaluacion;
  var cuerpo = el('div', 'hoy-eval');
  cuerpo.appendChild(el('p', 'hoy-eval-titulo', e.titulo));
  var fila = el('div', 'hoy-eval-fila');
  var cuenta = el('p', 'hoy-eval-cuenta' + (e.dias === 0 ? ' is-hoy' : ''), e.cuenta);
  cuenta.setAttribute('aria-label', 'Cuenta regresiva: ' + e.cuenta);
  fila.appendChild(cuenta);
  var meta = el('p', 'hoy-eval-meta', e.tipo + ' · ' + e.fecha.split('-').reverse().join('/'));
  fila.appendChild(meta);
  cuerpo.appendChild(fila);
  var pie = el('div', 'hoy-pie');
  pie.appendChild(boton('Ver en calendario', function () { irA('calendario'); }));
  cuerpo.appendChild(pie);
  return tarjeta('Próxima evaluación', cuerpo);
}

/* ---------- eventos que obligan a repintar ---------- */
var escuchado = false;
function escucharEventos() {
  if (escuchado || typeof window === 'undefined') return;
  escuchado = true;
  // El Pomodoro avisa cuánto estudiaste
  window.addEventListener('cb:estudio', function () { renderHoy(); });
  // La captura rápida avisa que hay tarea nueva
  window.addEventListener('cb:hoy-actualizar', function () { renderHoy(); });
}
