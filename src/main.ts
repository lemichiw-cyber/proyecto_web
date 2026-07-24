import { store, type User, type UserRole } from './store';
import { loadSession, saveSession, clearSession, getRoleDisplay, verifyPassword } from './auth';
import { themes, applyTheme, loadSavedTheme, type ThemeName } from './themes';
import { $, escapeHtml, toast, lockBody, unlockBody, renderPreguntaEditor, collectPreguntas, renderPreguntaSimulador, collectRespuestas } from './ui';
import { getExamenes, saveExamen, deleteExamen, validatePregunta, createExamen } from './exams';
import type { Examen } from './db';

// ---- Estado global de exámenes ----
let examQCount = 0;
let examEnCurso: { examen: Examen; tiempoRestante: number; respuestas: any[]; iniciado: number } | null = null;
let examTimerId: ReturnType<typeof setInterval> | null = null;

// ---- Apps data ----
const appsData = [
  { id:'inicio', icon:'🏠', label:'Inicio', desc:'Resumen y accesos rápidos', color:'var(--primary)' },
  { id:'actividades', icon:'📝', label:'Actividades', desc:'Tareas y entregas', color:'var(--green)' },
  { id:'examenes', icon:'📄', label:'Exámenes', desc:'Creador y simulador', color:'var(--purple)' },
  { id:'foros', icon:'💬', label:'Foros', desc:'Debates y consultas', color:'var(--orange)' },
  { id:'agenda', icon:'📅', label:'Agenda', desc:'Eventos y recordatorios', color:'var(--cyan)' },
  { id:'calendario', icon:'🗓️', label:'Calendario', desc:'Vista mensual', color:'var(--pink)' },
  { id:'horario', icon:'⏰', label:'Horario', desc:'Clases semanales', color:'var(--indigo)' },
  { id:'clases', icon:'🎓', label:'Clases', desc:'Material y grabaciones', color:'var(--teal)' },
  { id:'mensajes', icon:'✉️', label:'Mensajes', desc:'Internos y notificaciones', color:'var(--red)' },
  { id:'grupales', icon:'👥', label:'Grupales', desc:'Trabajo colaborativo', color:'var(--lime)' },
  { id:'protegido', icon:'🔐', label:'Protegido', desc:'Área restringida', color:'var(--amber)' },
  { id:'tareas', icon:'✅', label:'Mis Tareas', desc:'Pendientes y entregadas', color:'var(--violet)' },
  { id:'aulas', icon:'🏫', label:'Aulas', desc:'Gestión de cursos', color:'var(--rose)' },
  { id:'planificacion', icon:'📋', label:'Planificación', desc:'Plan de trabajo y notas', color:'var(--slate)' },
  { id:'matricula', icon:'📋', label:'Matrícula', desc:'Inscripciones', color:'var(--gray)' },
  { id:'configuracion', icon:'⚙️', label:'Configuración', desc:'Temas y preferencias', color:'var(--sky)' }
];

// ---- Apps ----
const apps = ['inicio','actividades','examenes','foros','agenda','calendario','horario','clases','mensajes','grupales','protegido','tareas','aulas','planificacion','matricula','configuracion'];
const appsProtegidas = new Set(['actividades','examenes','foros','agenda','calendario','horario','clases','mensajes','grupales','protegido','tareas','aulas','planificacion','matricula']);

// ---- Sesión ----
function initSession() {
  const user = loadSession();
  if (user) updateUserUI(user);
}

function updateUserUI(user: User) {
  const btnLogin = $('btn-login');
  const btnIngresar = $('btn-ingresar-hero');
  if (btnLogin) btnLogin.style.display = 'none';
  if (btnIngresar) btnIngresar.style.display = 'none';
  const ui = $('user-info');
  if (ui) { ui.style.display = 'flex'; ui.classList.remove('hidden'); }
  const rolDisplay = getRoleDisplay(user.rol);
  const emailDisplay = $('user-email-display');
  if (emailDisplay) emailDisplay.textContent = `${user.email} (${rolDisplay})`;
  const sui = $('sidebar-user-info');
  if (sui) { sui.style.display = 'flex'; sui.classList.remove('hidden'); }
  const sidebarEmail = $('sidebar-user-email');
  if (sidebarEmail) sidebarEmail.textContent = `${user.email} (${rolDisplay})`;
}

// ---- Navegación ----
function mostrarApp(id: string) {
  if (appsProtegidas.has(id) && !store.isLoggedIn) {
    toast('Inicia sesión para acceder.', 'error');
    $('btn-login')?.click();
    return;
  }
  apps.forEach(a => {
    const sec = $(`app-${a}`);
    if (sec) sec.classList.add('hidden');
  });
  const target = $(`app-${id}`);
  if (target) target.classList.remove('hidden');
  window.scrollTo(0, 0);
  if (id === 'inicio') renderInicio();
  if (id === 'examenes') initExamenes();
  if (id === 'configuracion') initConfiguracion();
  closeSidebar();
}

function closeSidebar() {
  const sidebar = $('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  unlockBody();
}

(window as any).mostrarApp = mostrarApp;

// ---- Inicio ----
function renderInicio() {
  const heroSub = $('hero-sub');
  const heroTitle = $('hero-title');
  const heroDesc = $('hero-desc');
  if (store.user) {
    heroSub!.textContent = store.user.rol.charAt(0).toUpperCase() + store.user.rol.slice(1);
    heroTitle!.textContent = `¡Bienvenido, ${store.user.nombre}!`;
    heroDesc!.textContent = 'Gestiona tus actividades, revisa tu horario y mantente al día.';
  } else {
    heroSub!.textContent = 'INCOA';
    heroTitle!.textContent = 'INCOA';
    heroDesc!.textContent = 'Plataforma educativa para estudiantes, docentes, directores y padres de familia.';
  }
  const statsEl = $('inicio-stats');
  if (store.isLoggedIn) {
    statsEl!.style.display = 'block';
    statsEl!.classList.remove('hidden');
    // TODO: cargar contadores reales
  } else {
    statsEl!.style.display = 'none';
    statsEl!.classList.add('hidden');
  }
  // App cards
  const el = $('inicio-apps');
  if (el) {
    el.style.gridTemplateColumns = 'repeat(auto-fill,minmax(150px,1fr))';
    el.innerHTML = appsData.map(a => {
      const isProtected = appsProtegidas.has(a.id);
      const locked = !store.isLoggedIn && isProtected;
      return `
        <div class="app-card${locked ? ' app-card-locked' : ''}"
          onclick="${locked ? `toast('Inicia sesión para acceder.','error');document.getElementById('btn-login').click()` : `mostrarApp('${a.id}')`}">
          <div class="app-icon" style="background:${a.color}">${a.icon}</div>
          <div class="app-label">${a.label}</div>
          <div class="app-desc">${a.desc}</div>
          ${locked ? '<span class="app-lock">🔒</span>' : ''}
        </div>
      `;
    }).join('');
  }
}

// ---- Login ----
const modalLogin = $('modal-login');
$('btn-login')?.addEventListener('click', () => { modalLogin?.classList.add('open'); lockBody(); });
$('modal-login-close')?.addEventListener('click', () => { modalLogin?.classList.remove('open'); unlockBody(); });
modalLogin?.addEventListener('click', e => { if (e.target === modalLogin) { modalLogin.classList.remove('open'); unlockBody(); } });

$('form-login')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const rol = ($('login-rol') as HTMLSelectElement)?.value;
  const email = ($('login-email') as HTMLInputElement)?.value.trim();
  const pass = ($('login-pass') as HTMLInputElement)?.value.trim();
  if (!email || pass.length < 6) { toast('Ingresa un correo y contraseña válidos (mín. 6 caracteres).', 'error'); return; }
  if (!verifyPassword(email, pass)) { toast('Contraseña incorrecta.', 'error'); return; }
  const user = { email, rol: rol as UserRole, nombre: email.split('@')[0] };
  saveSession(user);
  updateUserUI(user);
  modalLogin!.classList.remove('open');
  unlockBody();
  toast(`Bienvenido, ${user.nombre}`, 'success');
  renderInicio();
  mostrarApp('inicio');
});

$('btn-logout')?.addEventListener('click', () => {
  clearSession();
  const btnLogin = $('btn-login'); if (btnLogin) btnLogin.style.display = '';
  const btnIngresar = $('btn-ingresar-hero'); if (btnIngresar) btnIngresar.style.display = '';
  const ui = $('user-info'); if (ui) { ui.style.display = 'none'; ui.classList.add('hidden'); }
  const sui = $('sidebar-user-info'); if (sui) { sui.style.display = 'none'; sui.classList.add('hidden'); }
  toast('Sesión cerrada', 'info');
  renderInicio();
  mostrarApp('inicio');
});

// ---- Temas ----
const modalTemas = $('modal-temas');
function abrirTemas() { modalTemas?.classList.add('open'); lockBody(); }
function cerrarTemas() { modalTemas?.classList.remove('open'); unlockBody(); }
(window as any).abrirTemas = abrirTemas;
$('modal-temas-close')?.addEventListener('click', cerrarTemas);
modalTemas?.addEventListener('click', e => { if (e.target === modalTemas) cerrarTemas(); });

function seleccionarTema(theme: ThemeName) {
  applyTheme(theme);
  cerrarTemas();
  const nombres: Record<string,string> = { light:'claro', dark:'oscuro', pastel:'pastel', sunset:'atardecer', dawn:'amanecer', ocean:'océano', mlp:'My Little Pony', chicawa:'Chicawa', sakura:'Sakura', paraiso:'Paraíso' };
  toast(`Tema cambiado a ${nombres[theme] || theme} 🌸`, 'success');
}
(window as any).seleccionarTema = seleccionarTema;

function initConfiguracion() {
  const section = $('#theme-options-section');
  if (!section) return;
  const temas = Object.values(themes);
  section.innerHTML = temas.map(t => `
    <div class="theme-card" data-theme="${t.id}" onclick="seleccionarTema('${t.id}')">
      <div class="theme-preview" style="background:${t.colors.bgSecondary};border:2px solid ${t.colors.border};border-radius:10px;padding:.25rem;text-align:center;">
        <div style="height:28px;background:${t.colors.primary};border-radius:6px;margin-bottom:.3rem;"></div>
        <div style="height:14px;background:${t.colors.bg};border-radius:4px;margin-bottom:.2rem;"></div>
        <div style="height:14px;background:${t.colors.border};border-radius:4px;"></div>
      </div>
      <span style="font-size:.65rem;font-weight:600;display:inline-flex;align-items:center;gap:2px;">${t.icon} ${t.label}</span>
    </div>
  `).join('');
}

function initTheme() {
  applyTheme(loadSavedTheme());
}

// ---- Exámenes ----
async function initExamenes() {
  await getExamenes();
  await renderExamenesGuardados();
  examQCount = 0;
}

(window as any).examCambiarTipo = function(sel: HTMLSelectElement) {
  const idx = sel.dataset.idx;
  const body = document.querySelector(`.pregunta-body[data-idx="${idx}"]`);
  const tipo = sel.value;
  if (!body) return;
  if (tipo === 'multiple') {
    body.innerHTML = `
      <div class="opt-row"><span class="opt-label">A)</span><input type="text" placeholder="Opción A" data-idx="${idx}" data-opt="0"><input type="radio" name="correcta-${idx}" value="0"></div>
      <div class="opt-row"><span class="opt-label">B)</span><input type="text" placeholder="Opción B" data-idx="${idx}" data-opt="1"><input type="radio" name="correcta-${idx}" value="1"></div>
      <div class="opt-row"><span class="opt-label">C)</span><input type="text" placeholder="Opción C" data-idx="${idx}" data-opt="2"><input type="radio" name="correcta-${idx}" value="2"></div>
    `;
  } else if (tipo === 'vf') {
    body.innerHTML = `
      <div style="padding:.4rem 0;font-size:.85rem;color:var(--gray-500);">Seleccioná la respuesta correcta:</div>
      <label class="opt-row" style="margin-bottom:.3rem;"><input type="radio" name="correcta-${idx}" value="1"> <span>✅ Verdadero</span></label>
      <label class="opt-row"><input type="radio" name="correcta-${idx}" value="0"> <span>❌ Falso</span></label>
    `;
  } else {
    body.innerHTML = `
      <div style="padding:.4rem 0;font-size:.85rem;color:var(--gray-500);">Escribí la respuesta correcta (sin distinguir mayúsculas):</div>
      <input type="text" placeholder="Ej: Buenos Aires" data-idx="${idx}" data-resp="" style="width:100%;padding:.45rem;border:1.5px solid var(--gray-300);border-radius:8px;font:inherit;font-size:.85rem;">
    `;
  }
};

$('btn-exam-add-q')?.addEventListener('click', () => {
  examQCount++;
  const html = renderPreguntaEditor(examQCount);
  $('#exam-q-list')!.insertAdjacentHTML('beforeend', html);
});

$('btn-exam-guardar')?.addEventListener('click', async () => {
  const titulo = ($('exam-titulo') as HTMLInputElement)?.value.trim();
  const tiempo = parseInt(($('exam-tiempo') as HTMLInputElement)?.value, 10) || 60;
  if (!titulo) { toast('El título es obligatorio.', 'error'); return; }
  const preguntas = collectPreguntas();
  if (!preguntas.length) { toast('Agrega al menos 1 pregunta.', 'error'); return; }
  for (const p of preguntas) {
    const err = validatePregunta(p);
    if (err) { toast(err, 'error'); return; }
  }
  const examen = createExamen(titulo, tiempo, preguntas);
  await saveExamen(examen);
  toast('✔️ Examen guardado correctamente.', 'success');
  ($('exam-titulo') as HTMLInputElement)!.value = '';
  ($('exam-tiempo') as HTMLInputElement)!.value = '60';
  $('#exam-q-list')!.innerHTML = '';
  examQCount = 0;
  renderExamenesGuardados();
});

async function renderExamenesGuardados() {
  const examenes = await getExamenes();
  const list = $('#exam-lista-guardados');
  if (!list) return;
  if (!examenes.length) { list.innerHTML = '<div class="empty-msg">No hay exámenes guardados.</div>'; return; }
  list.innerHTML = examenes.map(e => `
    <div class="card" style="margin-bottom:.5rem;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <strong>${escapeHtml(e.titulo)}</strong>
        <span style="margin-left:.5rem;font-size:.75rem;color:var(--gray-500);">${e.preguntas.length} preguntas · ${e.tiempo} min</span>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="eliminarExamen('${e.id}')">Eliminar</button>
    </div>
  `).join('');
}

(window as any).eliminarExamen = async (id: string) => {
  if (!confirm('¿Eliminar este examen?')) return;
  await deleteExamen(id);
  renderExamenesGuardados();
};

$('btn-exam-start')?.addEventListener('click', async () => {
  const select = $('exam-select') as HTMLSelectElement;
  if (!select?.value) { toast('Seleccioná un examen.', 'error'); return; }
  const examenes = await getExamenes();
  const ex = examenes.find(e => e.id === select.value);
  if (!ex) return;
  examEnCurso = { examen: ex, tiempoRestante: ex.tiempo * 60, respuestas: [], iniciado: Date.now() };
  renderSimulador();
  startTimer();
});

function renderSimulador() {
  if (!examEnCurso) return;
  $('#exam-selector')!.classList.add('hidden');
  $('#exam-simulador')!.classList.remove('hidden');
  $('#exam-resultado')!.classList.add('hidden');
  const ex = examEnCurso.examen;
  $('#exam-preguntas')!.innerHTML = ex.preguntas.map((q, qi) => renderPreguntaSimulador(q, qi)).join('');
  $('#exam-preguntas')!.querySelectorAll('input[type="radio"]').forEach(r => r.addEventListener('change', updateProgress));
  $('#exam-preguntas')!.querySelectorAll('.exam-fill-input').forEach(i => i.addEventListener('input', updateProgress));
  updateTimer();
  updateProgress();
}

function updateProgress() {
  if (!examEnCurso) return;
  const total = examEnCurso.examen.preguntas.length;
  let respondidas = 0;
  for (let i = 0; i < total; i++) {
    const radios = document.querySelectorAll(`input[name="exam-resp-${i}"]`);
    let ok = false;
    radios.forEach(r => { if ((r as HTMLInputElement).checked) ok = true; });
    if (!ok) {
      const fill = document.querySelector(`.exam-fill-input[data-qi="${i}"]`) as HTMLInputElement;
      if (fill?.value.trim()) ok = true;
    }
    if (ok) respondidas++;
  }
  $('#exam-progress')!.textContent = `${respondidas}/${total}`;
  $('#exam-progress-bar')!.style.width = `${(respondidas/total)*100}%`;
}

function startTimer() {
  if (examTimerId) clearInterval(examTimerId);
  examTimerId = setInterval(() => {
    if (!examEnCurso) { clearInterval(examTimerId!); return; }
    examEnCurso.tiempoRestante--;
    updateTimer();
    if (examEnCurso.tiempoRestante <= 0) { clearInterval(examTimerId!); enviarExamen(); }
  }, 1000);
}

function updateTimer() {
  if (!examEnCurso) return;
  const t = examEnCurso.tiempoRestante;
  const m = String(Math.floor(t/60)).padStart(2,'0');
  const s = String(t%60).padStart(2,'0');
  const el = $('#exam-timer');
  if (el) el.textContent = `${m}:${s}`;
  if (el) { el.className = 'timer'; if (t <= 60) el.classList.add('danger'); else if (t <= 180) el.classList.add('warning'); }
}

$('btn-exam-enviar')?.addEventListener('click', () => {
  if (confirm('¿Enviar examen? No podrás cambiar respuestas.')) enviarExamen();
});

function enviarExamen() {
  if (!examEnCurso) return;
  clearInterval(examTimerId!);
  const respuestas = collectRespuestas(examEnCurso.examen.preguntas);
  let correctas = 0;
  examEnCurso.examen.preguntas.forEach((q, i) => {
    const r = respuestas[i];
    if (r === null || r === '') return;
    if (q.tipo === 'completar') {
      if ((r as string) === (q as any).respuesta) correctas++;
    } else {
      if (r === (q as any).correcta) correctas++;
    }
  });
  const total = examEnCurso.examen.preguntas.length;
  const pct = total ? Math.round(correctas/total*100) : 0;
  const aprobado = pct >= 60;
  $('#exam-simulador')!.classList.add('hidden');
  const res = $('#exam-resultado')!;
  res.className = 'exam-resultado' + (aprobado ? ' aprobado' : ' reprobado');
  res.classList.remove('hidden');
  $('#exam-nota')!.textContent = `${correctas}/${total}`;
  $('#exam-mensaje')!.textContent = aprobado ? `✅ ¡Aprobado! (${pct}%)` : `❌ Reprobado (${pct}%). Mínimo 60%`;
  examEnCurso = null;
}

// ---- Tabs Exámenes ----
document.querySelectorAll('[data-exam-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (examEnCurso && !confirm('Hay un examen en curso. ¿Salir?')) return;
    examEnCurso = null; clearInterval(examTimerId!);
    document.querySelectorAll('[data-exam-tab]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.getAttribute('data-exam-tab');
    $('#exam-tab-profesor')!.classList.toggle('hidden', tab !== 'profesor');
    $('#exam-tab-estudiante')!.classList.toggle('hidden', tab !== 'estudiante');
    $('#exam-tab-plan')!.classList.toggle('hidden', tab !== 'plan');
    if (tab === 'plan') renderPlanGrid();
  });
});

function renderPlanGrid() {
  $('#plan-grid')!.innerHTML = '<div class="empty-msg">Selecciona un grupo para ver la planilla.</div>';
}

// ---- Inicialización ----
initTheme();
initSession();
mostrarApp('inicio');