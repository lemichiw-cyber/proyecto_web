/* ===================================================================
   Sakura Player — Mezclador + Ecualizador
   MASTER / MÚSICA / BAJOS / AGUDOS / BALANCE + 10 bandas + presets
   =================================================================== */

import { player } from '../player/player.js';
import { EQ_FREQUENCIES, EQ_LABELS, EQ_PRESETS, applyPreset, readCurrentGains } from '../audio/equalizer.js';
import { loadMixer, saveMixer, applyMixer, readLevels } from '../audio/mixer.js';
import { icon, toast } from './ui.js';

export class MixerView {
  constructor(root) {
    this.root = root;
    this.state = loadMixer();
    this.gains = readCurrentGains();
    this.preset = 'custom';
  }

  render() {
    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem;">' +
      '<div class="sp-panel" style="padding:1rem;">' +
        '<div class="sp-panel-title" style="margin-bottom:.8rem;">Mezclador</div>' +
        this._channel('master', 'MASTER', 'gain') +
        this._channel('music', 'MÚSICA', 'gain') +
        this._channel('bass', 'BAJOS', 'db') +
        this._channel('treble', 'AGUDOS', 'db') +
        this._channel('balance', 'BALANCE', 'pan') +
      '</div>' +
      '<div class="sp-panel" style="padding:1rem;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem;flex-wrap:wrap;gap:.5rem;">' +
          '<div class="sp-panel-title">Ecualizador</div>' +
          '<select class="sp-select" id="sp-eq-preset" style="font-size:.78rem;padding:.35rem .6rem;">' +
            Object.entries(EQ_PRESETS).map(([id, p]) => '<option value="' + id + '">' + p.name + '</option>').join('') +
          '</select>' +
        '</div>' +
        '<div style="display:flex;align-items:flex-end;gap:6px;height:150px;" id="sp-eq-bars">' +
          EQ_LABELS.map((l, i) => '<div style="display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-width:0;">' +
            '<input type="range" class="sp-eq-slider" data-band="' + i + '" min="-12" max="12" step="1" value="' + (this.gains[i] || 0) + '" ' +
              'style="writing-mode:vertical-lr;direction:rtl;width:22px;height:110px;" aria-label="' + EQ_FREQUENCIES[i] + ' Hz">' +
            '<span style="font-size:.6rem;color:var(--player-text-secondary);">' + l + '</span></div>').join('') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  _channel(id, label, type) {
    const s = this.state;
    const isGain = type === 'gain';
    const min = isGain ? 0 : (type === 'db' ? -12 : -1);
    const max = isGain ? 1 : (type === 'db' ? 12 : 1);
    const step = isGain ? 0.01 : (type === 'db' ? 0.5 : 0.01);
    const value = s[id];
    const pct = Math.round(((value - min) / (max - min)) * 100);
    const muteKey = id + 'Mute';
    return '<div style="display:flex;align-items:center;gap:.6rem;padding:.45rem 0;border-bottom:1px solid var(--player-border);">' +
      '<span style="font-size:.68rem;font-weight:700;letter-spacing:.08em;color:var(--player-text-secondary);min-width:64px;">' + label + '</span>' +
      '<input type="range" class="sp-slider" data-mixer="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '" style="flex:1;">' +
      '<span class="sp-level" style="width:52px;"><div class="sp-level-fill" style="width:' + pct + '%;"></div></span>' +
      '<span style="font-size:.68rem;min-width:38px;text-align:right;color:var(--player-text-secondary);">' + pct + '%</span>' +
      '<button class="sp-btn sp-btn-icon" data-mute-channel="' + id + '" title="Mute" style="width:28px;height:28px;">' +
        (s[muteKey] ? icon('mute') : icon('volume')) + '</button>' +
    '</div>';
  }

  mount() {
    // Mezclador
    this.root.querySelectorAll('[data-mixer]').forEach((slider) => {
      slider.addEventListener('input', () => {
        const id = slider.dataset.mixer;
        const val = parseFloat(slider.value);
        this.state[id] = val;
        saveMixer(this.state);
        applyMixer(player, this.state);
        const pct = Math.round(((val - parseFloat(slider.min)) / (parseFloat(slider.max) - parseFloat(slider.min))) * 100);
        const row = slider.closest('div');
        row.querySelector('.sp-level-fill').style.width = pct + '%';
        row.querySelector('span[style*="min-width:38px"]').textContent = pct + '%';
      });
    });
    this.root.querySelectorAll('[data-mute-channel]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const ch = btn.dataset.muteChannel;
        const key = ch + 'Mute';
        this.state[key] = !this.state[key];
        saveMixer(this.state);
        applyMixer(player, this.state);
        btn.innerHTML = this.state[key] ? icon('mute') : icon('volume');
        toast(this.state[key] ? ch.toUpperCase() + ' silenciado' : ch.toUpperCase() + ' activado', 'success');
      }));

    // Ecualizador
    const presetSel = this.root.querySelector('#sp-eq-preset');
    presetSel.value = this._detectPreset();
    presetSel.addEventListener('change', () => {
      this.preset = presetSel.value;
      this.gains = applyPreset(player, this.preset) || this.gains;
      this._syncEqSliders();
      try { localStorage.setItem('sp_eq', JSON.stringify(this.gains)); } catch (e) { /* sin storage */ }
      toast('Preset: ' + EQ_PRESETS[this.preset].name, 'success');
    });
    this.root.querySelectorAll('.sp-eq-slider').forEach((slider) => {
      slider.addEventListener('input', () => {
        const i = +slider.dataset.band;
        this.gains[i] = parseFloat(slider.value);
        player.setEqBand(i, this.gains[i]);
        this.preset = 'custom';
        presetSel.value = 'custom';
        try { localStorage.setItem('sp_eq', JSON.stringify(this.gains)); } catch (e) { /* sin storage */ }
      });
    });
    this._syncEqSliders();
    applyMixer(player, this.state);
  }

  _detectPreset() {
    const gains = this.gains;
    for (const [id, p] of Object.entries(EQ_PRESETS)) {
      if (id === 'custom') continue;
      if (p.gains.every((g, i) => Math.abs(g - (gains[i] || 0)) < 0.6)) return id;
    }
    return 'custom';
  }

  _syncEqSliders() {
    this.root.querySelectorAll('.sp-eq-slider').forEach((s) => {
      const i = +s.dataset.band;
      s.value = this.gains[i] || 0;
    });
  }

  /* Indicadores de nivel en vivo (llamado por el controlador) */
  tick() {
    const analyser = player.getAnalyser();
    if (!analyser) return;
    const levels = readLevels(analyser);
    this.root.querySelectorAll('.sp-level-fill').forEach((el, i) => {
      if (i < 2) el.style.width = Math.round((i === 0 ? levels.master : levels.music) * 100) + '%';
    });
  }
}
