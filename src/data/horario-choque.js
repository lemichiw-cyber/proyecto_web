/* ===================================================================
   horario-choque.js — Detección de choques de horario (puro, sin DOM)
   =================================================================== */
export function detectarChoqueHorario(horarioItems, datos) {
  const dias = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  const choques = [];
  dias.forEach(function (dia) {
    const val = datos[dia];
    if (!val || val.toUpperCase() === 'RECESO' || val.toUpperCase() === 'ALMUERZO') return;
    horarioItems.forEach(function (row) {
      if (row.hora === datos.hora && row[dia] && row[dia].toUpperCase() !== 'RECESO' && row[dia].toUpperCase() !== 'ALMUERZO' && row[dia] !== val) {
        choques.push(row.hora + ' ' + dia + ': ' + row[dia]);
      }
    });
  });
  return choques;
}
