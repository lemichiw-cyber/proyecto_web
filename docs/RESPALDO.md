# Respaldo de datos (exportar / importar)

Formato del archivo JSON que descarga el botón **Exportar respaldo** en
*Configuración → Datos, respaldo y modo ahorro*.

## Por qué existe

Todo lo que guardan las funciones de bachillerato vive en `localStorage`,
que es **local al navegador y al dispositivo**. Si el estudiante borra los
datos del navegador, usa otro teléfono o reinstala la app, pierde lo suyo.
El respaldo permite llevarse los datos a otro dispositivo sin cuenta y sin
servidor.

## Estructura

```json
{
  "version": 1,
  "fecha": "2026-10-11",
  "cantidad": 3,
  "excluidas": ["sistema.ahorro"],
  "datos": {
    "notas.materias": [ /* … */ ],
    "servicio.meta": 200,
    "horario.clases": [ /* … */ ]
  }
}
```

| Campo | Tipo | Significado |
| --- | --- | --- |
| `version` | número | Versión del formato. Si es **mayor** que la que soporta la app, la importación se rechaza con un mensaje claro. |
| `fecha` | string | Día en que se exportó, `YYYY-MM-DD`. |
| `cantidad` | número | Cuántas secciones incluye. |
| `excluidas` | lista | Claves que se excluyen a propósito (ver más abajo). |
| `datos` | objeto | Clave → valor, tal como se guardaron. |

## Claves incluidas

Sólo se exportan las claves que están en `ESQUEMA_RESPALDO`
(`src/bachillerato/datos/logica-datos.js`). Nombres legibles en
`NOMBRES_CLAVES`.

| Clave | Tipo | Contenido |
| --- | --- | --- |
| `notas.config` | objeto | Ajustes de cálculo de notas. |
| `notas.materias` | lista | Materias, períodos y actividades. |
| `horario.clases` | lista | Clases del horario semanal. |
| `agenda.tareas` | lista | Tareas, exámenes y eventos. |
| `paes.banco` | objeto | Banco de preguntas cargado. |
| `paes.historial` | lista | Simulacros rendidos. |
| `paes.metas` | objeto | Metas de aprobación. |
| `paes.tarjetas` | lista | Tarjetas de repaso (Leitner). |
| `paes.simulacro-en-curso` | objeto | Simulacro pausado. |
| `servicio.horas` | lista | Registros de horas. |
| `servicio.meta` | número | Meta de horas. |
| `proyecto.hitos` | lista | Hitos del proyecto de grado. |
| `centro.comunicados` | lista | Comunicados y eventos. |
| `orientacion.registros` | lista | Registros de orientación. |
| `apoyo.contactos` | lista | Contactos de apoyo. |
| `apoyo.consejos` | lista | Consejos guardados. |
| `estudio.sesiones` | lista | Sesiones del Pomodoro. |
| `estudio.metas` | número | Meta semanal de estudio. |
| `estudio.rachas` | objeto | Rachas. |

## Qué NO incluye

- **La cuenta ni la contraseña.** El respaldo no está ligado a la cuenta.
- **`sistema.ahorro`** (modo ahorro): es una preferencia del dispositivo,
  no del estudiante; se lista en `excluidas` y se ignora al importar.
- Cualquier clave desconocida: se **ignora**, nunca se importa a ciegas.

## Validación al importar

Antes de restaurar, la app:

1. Parsea el JSON. Si falla, avisa y no toca nada.
2. Comprueba `version`. Si es más nueva que la soportada, se niega.
3. Comprueba `datos`.
4. Para cada clave: si no está en el esquema, o su **tipo** no coincide
   (lista / objeto / número), se **ignora** y se informa.
5. Si al final no queda ninguna clave reconocible, se niega.
6. Muestra un **resumen legible** de lo que contiene y pide confirmación
   antes de sobrescribir.

## Convenciones

- Fechas: `YYYY-MM-DD`, parseadas a mano (ver `utils.js` → `aFecha`) porque
  `new Date('AAAA-MM-DD')` se interpreta en UTC y desfasa un día en El
  Salvador.
- Números: minutos y horas como números finitos; porcentajes 0–100.
- El respaldo es un JSON legible por una persona; no lleva binario ni
  codificación rara.

## Privacidad

El archivo se genera **en el navegador** y se descarga directamente. No se
envía a ningún servidor. Al importarlo, el contenido se aplica al
`localStorage` del dispositivo. Si el estudiante comparte el archivo, está
compartiendo sus propios datos personales (notas, contactos de apoyo,
horarios): conviene que sepa eso antes de mandarlo por WhatsApp o correo.
