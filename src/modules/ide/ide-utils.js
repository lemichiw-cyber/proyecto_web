/* ===================================================================
   ide-utils.js — Lógica pura del IDE para estudiantes de software.
   Sin DOM ni fetch: se puede probar de forma aislada (vitest).
   =================================================================== */

/* Catálogo de lenguajes: espejo del backend (/api/ide/lenguajes). */
export const LENGUAJES = [
  {
    id: 'python', nombre: 'Python', extension: '.py', monaco: 'python',
    depurable: true, ejecutable: true,
    ejemplo:
      'print("Hola, Mundo!")\n\n' +
      'for i in range(1, 6):\n' +
      '    print(f"Cuadrado de {i} = {i * i}")\n',
  },
  {
    id: 'javascript', nombre: 'JavaScript', extension: '.js', monaco: 'javascript',
    depurable: false, ejecutable: true,
    ejemplo:
      '// Hola Mundo en JavaScript\n' +
      'console.log("Hola, Mundo!");\n\n' +
      'const nums = [1, 2, 3, 4, 5];\n' +
      'console.log("Suma:", nums.reduce((a, b) => a + b, 0));\n',
  },
  {
    id: 'typescript', nombre: 'TypeScript', extension: '.ts', monaco: 'typescript',
    depurable: false, ejecutable: true,
    ejemplo:
      '// Hola Mundo en TypeScript\n' +
      'const saludo: string = "Hola, Mundo!";\n' +
      'console.log(saludo);\n\n' +
      'function cuadrado(n: number): number {\n' +
      '  return n * n;\n' +
      '}\n' +
      'console.log("Cuadrado de 7:", cuadrado(7));\n',
  },
  {
    id: 'java', nombre: 'Java', extension: '.java', monaco: 'java',
    depurable: false, ejecutable: true,
    ejemplo:
      'public class Main {\n' +
      '    public static void main(String[] args) {\n' +
      '        System.out.println("Hola, Mundo!");\n' +
      '        for (int i = 1; i <= 5; i++) {\n' +
      '            System.out.println("Cuadrado de " + i + " = " + (i * i));\n' +
      '        }\n' +
      '    }\n' +
      '}\n',
  },
  {
    id: 'c', nombre: 'C', extension: '.c', monaco: 'c',
    depurable: false, ejecutable: true,
    ejemplo:
      '#include <stdio.h>\n\n' +
      'int main(void) {\n' +
      '    printf("Hola, Mundo!\\n");\n' +
      '    for (int i = 1; i <= 5; i++) {\n' +
      '        printf("Cuadrado de %d = %d\\n", i, i * i);\n' +
      '    }\n' +
      '    return 0;\n' +
      '}\n',
  },
  {
    id: 'cpp', nombre: 'C++', extension: '.cpp', monaco: 'cpp',
    depurable: false, ejecutable: true,
    ejemplo:
      '#include <iostream>\n\n' +
      'int main() {\n' +
      '    std::cout << "Hola, Mundo!" << std::endl;\n' +
      '    for (int i = 1; i <= 5; i++) {\n' +
      '        std::cout << "Cuadrado de " << i << " = " << (i * i) << std::endl;\n' +
      '    }\n' +
      '    return 0;\n' +
      '}\n',
  },
];

/** Devuelve el config de un lenguaje por id (o python por defecto). */
export function lenguaje(id) {
  return LENGUAJES.find((l) => l.id === id) || LENGUAJES[0];
}

/** Extensión de archivo para un lenguaje. */
export function extensionDe(lenguajeId) {
  return lenguaje(lenguajeId).extension;
}

/** Nombre de archivo visible para una pestaña. */
export function nombreArchivo(lenguajeId, indice) {
  const base = indice === 0 ? 'main' : 'script' + (indice + 1);
  return base + extensionDe(lenguajeId);
}

/** Crea un archivo nuevo (puro: no toca el DOM). */
export function crearArchivo(lenguajeId, indice, contenido) {
  return {
    id: 'ar' + indice + '-' + Math.random().toString(36).slice(2, 8),
    nombre: nombreArchivo(lenguajeId, indice),
    lenguaje: lenguaje(lenguajeId).id,
    contenido: contenido !== undefined ? contenido : lenguaje(lenguajeId).ejemplo,
  };
}

/** Estado legible del resultado de una ejecución. */
export function estadoEjecucion(res) {
  if (!res) return 'vacio';
  if (res.codigo_salida === 124) return 'timeout';
  if (res.codigo_salida === 0) return 'exito';
  return 'error';
}

/** Texto consolidado para la consola de salida. */
export function textoConsola(res) {
  if (!res) return '';
  const partes = [];
  if (res.salida && res.salida.trim()) partes.push(res.salida.trimEnd());
  if (res.error && res.error.trim()) {
    partes.push((res.salida && res.salida.trim() ? '\n' : '') + '── errores ──\n' + res.error.trimEnd());
  }
  if (!partes.length && estadoEjecucion(res) === 'exito') {
    partes.push('(el programa se ejecutó sin imprimir nada)');
  }
  if (res.duracion_ms !== undefined) {
    partes.push('\n── proceso terminado · código ' + res.codigo_salida + ' · ' + res.duracion_ms + ' ms ──');
  }
  return partes.join('\n');
}

/** Etiqueta corta de estado para la barra de estado. */
export function etiquetaEstado(estado) {
  return {
    exito: '✅ Ejecutado',
    error: '❌ Con errores',
    timeout: '⏱ Tiempo agotado',
    vacio: '⬜ Sin ejecutar',
  }[estado] || estado;
}

/** Variables locales de un paso del depurador, como pares [clave, valor]. */
export function variablesDePaso(paso) {
  if (!paso || !paso.variables) return [];
  return Object.keys(paso.variables).map((k) => [k, paso.variables[k]]);
}

/** Línea actual resaltada del depurador (o null si no hay pasos). */
export function lineaActual(pasos, indicePaso) {
  if (!pasos || !pasos.length || indicePaso < 0 || indicePaso >= pasos.length) return null;
  return pasos[indicePaso].linea;
}

/** Descripción textual de un paso, para el panel de depuración. */
export function describirPaso(paso, indice, total) {
  if (!paso) return '';
  const vars = variablesDePaso(paso)
    .map(([k, v]) => k + ' = ' + v)
    .join(', ');
  return (
    'Paso ' + (indice + 1) + '/' + total +
    ' · línea ' + paso.linea +
    (paso.funcion && paso.funcion !== '<module>' ? ' · ' + paso.funcion : '') +
    (vars ? ' · ' + vars : '')
  );
}

/** Recorta texto largo para no llenar la consola. */
export function truncarTexto(texto, tope) {
  const t = String(texto || '');
  if (t.length <= tope) return t;
  return t.slice(0, tope) + '\n… [' + (t.length - tope) + ' caracteres recortados]';
}

/** ¿El lenguaje soporta depuración paso a paso? */
export function esDepurable(lenguajeId) {
  return lenguaje(lenguajeId).depurable === true;
}

/** Normaliza la respuesta del backend a un objeto de resultado. */
export function normalizarResultado(resp) {
  if (!resp || typeof resp !== 'object') {
    return { salida: '', error: 'Respuesta vacía del servidor.', codigo_salida: 1, duracion_ms: 0 };
  }
  return {
    salida: String(resp.salida || ''),
    error: String(resp.error || ''),
    codigo_salida: Number(resp.codigo_salida || 0),
    duracion_ms: Number(resp.duracion_ms || 0),
    pasos: Array.isArray(resp.pasos) ? resp.pasos : undefined,
    nota: resp.nota || undefined,
    lenguaje: resp.lenguaje || undefined,
  };
}