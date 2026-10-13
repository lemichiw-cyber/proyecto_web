# Preparación PAES — banco de preguntas

Esta carpeta guarda los bancos de preguntas de opción múltiple que usa
la sección **Preparación PAES** de la plataforma.

## ⚠️ Aviso importante antes de cargar material

1. **Las preguntas que vienen con la aplicación no son oficiales.**
   Son ejemplos originales, escritos para esta plataforma, y sirven
   solamente para practicar el formato de una prueba de opción múclea.
   No reproducen preguntas de pruebas oficiales ni de libros con
   derechos de autor.

2. **El banco real lo debe cargar el docente o la persona responsable
   del centro escolar.** Antes de subir cualquier material hay que
   verificar qué es de uso permitido:
   - Textos con derechos de autor (libros, artículos, exámenes
     oficiales publicados) **no** deben copiarse a esta carpeta sin
     autorización escrita.
   - Si el material es de uso libre, debe indicarse la fuente y la
     licencia.
   - Lo que se escriba desde cero para el centro escolar sí se puede
     usar, indicando quién lo elaboró.

3. **Esta aplicación no afirma que la preparación con estos simulacros
   garantice ningún resultado.** La prueba oficial la organiza el
   MINED y sus condiciones pueden cambiar.

## Esquema de un archivo de banco

Cada banco vive en `public/data/paes/<materia>.json`, donde `<materia>`
es un nombre corto en minúsculas y sin acentos (`matematica`,
`lenguaje`, …).

```jsonc
{
  "version": 1,                    // versión del esquema
  "materia": "Matemática",         // nombre que se muestra en pantalla
  "descripcion": "Texto corto",
  "aviso": "Declaración de origen del material",
  "preguntas": [
    {
      "id": "mat-001",             // único dentro del archivo
      "enunciado": "Texto de la pregunta",
      "opciones": [                // mínimo 2, máximo recomendado 5
        { "id": "a", "texto": "Primera opción" },
        { "id": "b", "texto": "Segunda opción" }
      ],
      "correcta": "b",             // id de la opción correcta
      "explicacion": "Por qué es la respuesta",   // opcional
      "tema": "Álgebra"            // opcional; alimenta el desglose
    }
  ]
}
```

### Reglas que valida la aplicación

- `preguntas` debe existir y ser una lista, aunque esté vacía.
- Cada `id` de pregunta debe ser único dentro del archivo.
- Cada pregunta necesita `enunciado` y al menos dos `opciones`.
- Todas las opciones necesitan `id` y `texto`, sin repetirse.
- `correcta` debe coincidir con el `id` de una de las opciones.
- `explicacion`, si existe, debe ser texto.
- `tema` es opcional; cuando falta, la pregunta entra al grupo
  «Sin tema».

Si algo falla, la aplicación muestra qué archivo y qué número de
pregunta tiene el problema, y deja usar sólo las preguntas válidas.

## Cómo se puntúa

La PAES oficial convierte los aciertos en un puntaje con una escala que
fija el MINED. **Esta aplicación no incluye esa conversión**, porque no
la conoce y no quiere inventarla. Por eso:

- El simulacro muestra **aciertos, errores, preguntas sin responder y
  porcentaje de acierto**.
- La meta personal se define en **porcentaje**.
- Cuando el centro escolar entregue la tabla de conversión oficial, se
  puede agregar al módulo `src/bachillerato/paes/paes-logica.js` sin
  tocar la interfaz.

## Cargar un banco nuevo

1. Crear el archivo `public/data/paes/<materia>.json` con el esquema de
   arriba.
2. Guardarlo y abrir la sección **Preparación PAES**. El banco aparece
   automáticamente en la lista de materias.
3. Si el archivo tiene errores, aparece un aviso con el detalle.

Los archivos de `public/data/paes/` se guardan con la aplicación y
quedan disponibles sin conexión una vez visitada la sección.

## Repaso con tarjetas

Además de los simulacros, la sección permite crear tarjetas propias
(pregunta por delante, respuesta por detrás). El repaso usa repetición
espaciada simple con las cajas de Leitner: cada acierto sube la tarjeta
una caja y la aleja más en el tiempo (1, 2, 4, 8 y 16 días); cada error
la devuelve a la caja 1 para repasarla mañana. Todo se guarda en el
teléfono del estudiante y se puede exportar con el respaldo general de
Configuración.
