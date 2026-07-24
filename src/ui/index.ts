import DOMPurify from 'dompurify';

export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function escapeHtml(str: string): string {
  return DOMPurify.sanitize(str, { ALLOWED_TAGS: [] });
}

export function setHtml(el: HTMLElement | null, html: string) {
  if (el) el.innerHTML = html;
}

export function setText(el: HTMLElement | null, text: string) {
  if (el) el.textContent = text;
}

export function show(el: HTMLElement | null) {
  if (el) { el.style.display = ''; el.classList.remove('hidden'); }
}

export function hide(el: HTMLElement | null) {
  if (el) { el.style.display = 'none'; el.classList.add('hidden'); }
}

export function toggle(el: HTMLElement | null, force?: boolean) {
  if (!el) return;
  const showNow = force ?? el.classList.contains('hidden');
  if (showNow) show(el); else hide(el);
}

export function toast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast toast-${type} show`;
  setTimeout(() => el.classList.remove('show'), 3500);
}

export function lockBody() {
  document.body.classList.add('no-scroll');
  document.body.style.top = `-${window.scrollY}px`;
}

export function unlockBody() {
  const top = document.body.style.top;
  document.body.classList.remove('no-scroll');
  document.body.style.top = '';
  if (top) window.scrollTo(0, -parseInt(top, 10));
}

export function openModal(id: string) {
  const modal = $(id);
  if (modal) {
    modal.classList.add('open');
    lockBody();
    modal.focus();
  }
}

export function closeModal(id: string) {
  const modal = $(id);
  if (modal) {
    modal.classList.remove('open');
    unlockBody();
  }
}

export function renderPreguntaEditor(idx: number, pregunta?: Pregunta): string {
  const tipo = pregunta?.tipo ?? 'multiple';
  const texto = pregunta?.texto ?? '';
  const isMultiple = tipo === 'multiple';
  const isVF = tipo === 'vf';
  const isCompletar = tipo === 'completar';

  const opts = isMultiple ? (pregunta as PreguntaMultiple).opciones : ['', '', ''];
  const correcta = isMultiple ? (pregunta as PreguntaMultiple).correcta : 0;
  const vfCorrecta = isVF ? (pregunta as PreguntaVF).correcta : true;
  const completarResp = isCompletar ? (pregunta as PreguntaCompletar).respuesta : '';

  return `
    <div class="pregunta-item" id="q-${idx}">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:.4rem;">
        <strong style="font-size:.85rem;">Pregunta ${idx}</strong>
        <div style="display:flex;gap:.5rem;align-items:center;">
          <select class="tipo-select" data-idx="${idx}" onchange="window.examCambiarTipo(this)"
            style="padding:.25rem;border:1px solid var(--gray-300);border-radius:6px;font:inherit;font-size:.78rem;">
            <option value="multiple" ${isMultiple ? 'selected' : ''}>Opción Múltiple</option>
            <option value="vf" ${isVF ? 'selected' : ''}>Verdadero/Falso</option>
            <option value="completar" ${isCompletar ? 'selected' : ''}>Completar</option>
          </select>
          <button type="button" onclick="this.closest('.pregunta-item').remove()"
            style="background:none;border:none;cursor:pointer;color:var(--red);font-size:1.2rem;padding:0 4px;">×</button>
        </div>
      </div>
      <textarea class="pregunta-textarea" placeholder="Escribe la pregunta..." data-idx="${idx}"
        style="width:100%;min-height:60px;padding:.5rem;border:1.5px solid var(--gray-300);border-radius:8px;font:inherit;font-size:.9rem;resize:vertical;margin-bottom:.5rem;">${escapeHtml(texto)}</textarea>
      <div class="pregunta-body" data-idx="${idx}">
        ${renderPreguntaBody(tipo, idx, opts, correcta, vfCorrecta, completarResp)}
      </div>
    </div>
  `;
}

function renderPreguntaBody(
  tipo: string, idx: number,
  opts: string[], correcta: number,
  vfCorrecta: boolean, completarResp: string
): string {
  if (tipo === 'multiple') {
    return `
      <div class="opt-row"><span class="opt-label">A)</span><input type="text" placeholder="Opción A" data-idx="${idx}" data-opt="0" value="${escapeHtml(opts[0])}"><input type="radio" name="correcta-${idx}" value="0" ${correcta === 0 ? 'checked' : ''}></div>
      <div class="opt-row"><span class="opt-label">B)</span><input type="text" placeholder="Opción B" data-idx="${idx}" data-opt="1" value="${escapeHtml(opts[1])}"><input type="radio" name="correcta-${idx}" value="1" ${correcta === 1 ? 'checked' : ''}></div>
      <div class="opt-row"><span class="opt-label">C)</span><input type="text" placeholder="Opción C" data-idx="${idx}" data-opt="2" value="${escapeHtml(opts[2])}"><input type="radio" name="correcta-${idx}" value="2" ${correcta === 2 ? 'checked' : ''}></div>
    `;
  }
  if (tipo === 'vf') {
    return `
      <div style="padding:.4rem 0;font-size:.85rem;color:var(--gray-500);">Seleccioná la respuesta correcta:</div>
      <label class="opt-row" style="margin-bottom:.3rem;"><input type="radio" name="correcta-${idx}" value="1" ${vfCorrecta ? 'checked' : ''}> <span>✅ Verdadero</span></label>
      <label class="opt-row"><input type="radio" name="correcta-${idx}" value="0" ${!vfCorrecta ? 'checked' : ''}> <span>❌ Falso</span></label>
    `;
  }
  return `
    <div style="padding:.4rem 0;font-size:.85rem;color:var(--gray-500);">Escribí la respuesta correcta (sin distinguir mayúsculas):</div>
    <input type="text" placeholder="Ej: Buenos Aires" data-idx="${idx}" data-resp="" value="${escapeHtml(completarResp)}"
      style="width:100%;padding:.45rem;border:1.5px solid var(--gray-300);border-radius:8px;font:inherit;font-size:.85rem;">
  `;
}

export function collectPreguntas(): Pregunta[] {
  const items = document.querySelectorAll('#exam-q-list .pregunta-item');
  const preguntas: Pregunta[] = [];
  items.forEach(item => {
    const idx = item.querySelector('.pregunta-textarea')?.getAttribute('data-idx');
    if (!idx) return;
    const texto = (item.querySelector('.pregunta-textarea') as HTMLTextAreaElement)?.value.trim() ?? '';
    if (!texto) return;
    const tipo = (item.querySelector('.tipo-select') as HTMLSelectElement)?.value ?? 'multiple';
    if (tipo === 'multiple') {
      const optA = (item.querySelector('input[data-opt="0"]') as HTMLInputElement)?.value.trim() ?? '';
      const optB = (item.querySelector('input[data-opt="1"]') as HTMLInputElement)?.value.trim() ?? '';
      const optC = (item.querySelector('input[data-opt="2"]') as HTMLInputElement)?.value.trim() ?? '';
      const correcta = (item.querySelector(`input[name="correcta-${idx}"]:checked`) as HTMLInputElement)?.value;
      preguntas.push({
        tipo: 'multiple', texto,
        opciones: [optA || '—', optB || '—', optC || '—'],
        correcta: correcta ? parseInt(correcta, 10) : 0
      });
    } else if (tipo === 'vf') {
      const correcta = (item.querySelector(`input[name="correcta-${idx}"]:checked`) as HTMLInputElement)?.value;
      preguntas.push({
        tipo: 'vf', texto,
        correcta: correcta ? parseInt(correcta, 10) === 1 : true
      });
    } else {
      const respInput = item.querySelector('input[data-resp]') as HTMLInputElement;
      preguntas.push({
        tipo: 'completar', texto,
        respuesta: respInput?.value.trim().toLowerCase() ?? ''
      });
    }
  });
  return preguntas;
}

export function renderPreguntaSimulador(q: Pregunta, qi: number): string {
  let html = `<div class="q-block"><div class="q-text">${qi + 1}. ${escapeHtml(q.texto)}</div>`;
  if (q.tipo === 'multiple') {
    html += (q as PreguntaMultiple).opciones.map((opt, oi) =>
      `<label class="opt-row"><input type="radio" name="exam-resp-${qi}" value="${oi}"> <span>${String.fromCharCode(65 + oi)}) ${escapeHtml(opt)}</span></label>`
    ).join('');
  } else if (q.tipo === 'vf') {
    html += `<label class="opt-row"><input type="radio" name="exam-resp-${qi}" value="1"> <span>✅ Verdadero</span></label>`;
    html += `<label class="opt-row"><input type="radio" name="exam-resp-${qi}" value="0"> <span>❌ Falso</span></label>`;
  } else {
    html += `<div style="margin-top:.4rem;"><input type="text" class="exam-fill-input" data-qi="${qi}" placeholder="Escribí tu respuesta..." style="width:100%;padding:.5rem;border:1.5px solid var(--gray-300);border-radius:8px;font:inherit;font-size:.9rem;"></div>`;
  }
  html += '</div>';
  return html;
}

export function collectRespuestas(preguntas: Pregunta[]): (string | number | boolean | null)[] {
  return preguntas.map((q, qi) => {
    if (q.tipo === 'completar') {
      const fill = document.querySelector(`.exam-fill-input[data-qi="${qi}"]`) as HTMLInputElement;
      return fill ? fill.value.trim().toLowerCase() : '';
    }
    const radios = document.querySelectorAll(`input[name="exam-resp-${qi}"]`);
    for (const r of radios) {
      if ((r as HTMLInputElement).checked) {
        return q.tipo === 'vf' ? (r as HTMLInputElement).value === '1' : parseInt((r as HTMLInputElement).value, 10);
      }
    }
    return null;
  });
}

import { Pregunta, PreguntaMultiple, PreguntaVF, PreguntaCompletar } from '../db';