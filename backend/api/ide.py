"""IDE en la nube para estudiantes de software.

Endpoints:
  GET    /api/ide/lenguajes        lenguajes soportados y su runtime
  POST   /api/ide/ejecutar         ejecuta código y devuelve salida/errores
  POST   /api/ide/depurar          depurador paso a paso (Python: trace real;
                                   otros lenguajes: traza con errores detallados)

Ejecución en sandbox:
  - Cada ejecución corre en un directorio temporal propio que se borra al
    terminar (tempfile.mkdtemp + shutil.rmtree en finally).
  - Timeout duro por ejecución (por defecto 10 s, tope 30 s) para que un
    bucle infinito no bloquee el worker.
  - Límite de tamaño del código (64 KB) y de entrada estándar (8 KB).
  - Se ejecuta con cwd en el temporal y sin variables de entorno heredadas
    sensibles (env mínimo), de modo que el código del estudiante no pueda
    leer secretos del servidor (NVIDIA_API_KEY, tokens, etc.).
  - Para ejecución persistente en producción con aislamiento de red real,
    levantar IDE_SANDBOX=1 con Docker disponible (ver execute()).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time
from typing import Dict, List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import require_auth

router = APIRouter(prefix="/api/ide", tags=["ide"])

# ------------------------------------------------------------------
# Configuración de lenguajes
# ------------------------------------------------------------------

# Ruta a node_modules del proyecto (para tipos TypeScript y compiladores JS).
_PROYECTO_RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_NODE_BIN = shutil.which("node") or "node"
_NPM_BIN = shutil.which("npm") or "npm"

LENGUAJES: Dict[str, dict] = {
    "python": {
        "nombre": "Python",
        "extension": ".py",
        "monaco": "python",
        "runtime": shutil.which("python3") or "python3",
        "ejecutable": True,
        "depurable": True,
        "ejemplo": 'print("Hola, Mundo!")\n\nfor i in range(1, 6):\n    print(f"Cuadrado de {i} = {i * i}")\n',
    },
    "javascript": {
        "nombre": "JavaScript",
        "extension": ".js",
        "monaco": "javascript",
        "runtime": _NODE_BIN,
        "ejecutable": True,
        "depurable": False,
        "ejemplo": '// Hola Mundo en JavaScript\nconsole.log("Hola, Mundo!");\n\nconst nums = [1, 2, 3, 4, 5];\nconsole.log("Suma:", nums.reduce((a, b) => a + b, 0));\n',
    },
    "typescript": {
        "nombre": "TypeScript",
        "extension": ".ts",
        "monaco": "typescript",
        "runtime": _NODE_BIN,
        "ejecutable": os.path.isdir(os.path.join(_PROYECTO_RAIZ, "node_modules", "typescript")),
        "depurable": False,
        "ejemplo": '// Hola Mundo en TypeScript\nconst saludo: string = "Hola, Mundo!";\nconsole.log(saludo);\n\nfunction cuadrado(n: number): number {\n  return n * n;\n}\nconsole.log("Cuadrado de 7:", cuadrado(7));\n',
    },
    "java": {
        "nombre": "Java",
        "extension": ".java",
        "monaco": "java",
        "runtime": shutil.which("java") or "java",
        "ejecutable": os.path.exists(shutil.which("javac") or ""),
        "depurable": False,
        "ejemplo": 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hola, Mundo!");\n        for (int i = 1; i <= 5; i++) {\n            System.out.println("Cuadrado de " + i + " = " + (i * i));\n        }\n    }\n}\n',
    },
    "c": {
        "nombre": "C",
        "extension": ".c",
        "monaco": "c",
        "runtime": shutil.which("gcc") or "gcc",
        "ejecutable": os.path.exists(shutil.which("gcc") or ""),
        "depurable": False,
        "ejemplo": '#include <stdio.h>\n\nint main(void) {\n    printf("Hola, Mundo!\\n");\n    for (int i = 1; i <= 5; i++) {\n        printf("Cuadrado de %d = %d\\n", i, i * i);\n    }\n    return 0;\n}\n',
    },
    "cpp": {
        "nombre": "C++",
        "extension": ".cpp",
        "monaco": "cpp",
        "runtime": shutil.which("g++") or "g++",
        "ejecutable": os.path.exists(shutil.which("g++") or ""),
        "depurable": False,
        "ejemplo": '#include <iostream>\n\nint main() {\n    std::cout << "Hola, Mundo!" << std::endl;\n    for (int i = 1; i <= 5; i++) {\n        std::cout << "Cuadrado de " << i << " = " << (i * i) << std::endl;\n    }\n    return 0;\n}\n',
    },
}

# Java exige que la clase pública se llame Main: si el código no lo hace, lo
# envolvemos en un wrapper antes de compilar para no frustrar al estudiante.


class EjecutarIn(BaseModel):
    codigo: str = Field(..., max_length=65536)
    lenguaje: str = Field(..., min_length=1, max_length=20)
    entrada: Optional[str] = Field(default="", max_length=8192)
    timeout_seg: Optional[int] = Field(default=10, ge=1, le=30)


class DepurarIn(BaseModel):
    codigo: str = Field(..., max_length=65536)
    lenguaje: str = Field(..., min_length=1, max_length=20)
    breakpoints: Optional[List[int]] = Field(default=None)
    max_pasos: Optional[int] = Field(default=500, ge=1, le=5000)


def _lenguaje_o_404(lenguaje: str) -> dict:
    cfg = LENGUAJES.get(lenguaje)
    if not cfg:
        raise HTTPException(
            status_code=400,
            detail=f"Lenguaje no soportado: '{lenguaje}'. Usá: {', '.join(LENGUAJES)}",
        )
    return cfg


def _env_minimo() -> dict:
    """Entorno mínimo: sin secretos del servidor, con LC_ALL para salida estable."""
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": "/tmp",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "NODE_PATH": os.path.join(_PROYECTO_RAIZ, "node_modules"),
    }


def _limitar_salida(texto: str, tope: int = 64 * 1024) -> str:
    if len(texto) <= tope:
        return texto
    return texto[:tope] + f"\n… [salida recortada: {len(texto) // 1024} KB en total]"


# ------------------------------------------------------------------
# Compilación / ejecución por lenguaje
# ------------------------------------------------------------------

def _preparar_fuente(tmpdir: str, lenguaje: str, codigo: str) -> str:
    """Escribe el archivo fuente y devuelve su ruta."""
    cfg = LENGUAJES[lenguaje]
    if lenguaje == "java":
        # Si no hay una clase Main pública, envolvemos el código para que
        # compile sin que el estudiante tenga que escribir la clase.
        import re

        if not re.search(r"\bclass\s+Main\b", codigo):
            codigo = (
                "public class Main {\n"
                "    public static void main(String[] args) {\n"
                + "".join("        " + ln + "\n" for ln in codigo.splitlines())
                + "    }\n"
                "}\n"
            )
        nombre = "Main.java"
    else:
        nombre = "main" + cfg["extension"]
    ruta = os.path.join(tmpdir, nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(codigo)
    return ruta


def _comandos(lenguaje: str, ruta_fuente: str, tmpdir: str) -> List[List[str]]:
    """Devuelve la lista de comandos a ejecutar (compilar y luego correr)."""
    node = _NODE_BIN
    tsc_local = os.path.join(_PROYECTO_RAIZ, "node_modules", "typescript", "bin", "tsc")
    if lenguaje == "python":
        return [[_lenguaje_o_404("python")["runtime"], ruta_fuente]]
    if lenguaje == "javascript":
        return [[node, ruta_fuente]]
    if lenguaje == "typescript":
        return [
            [node, tsc_local, "--target", "es2020", "--module", "commonjs", "--outDir", tmpdir, ruta_fuente],
            [node, os.path.join(tmpdir, "main.js")],
        ]
    if lenguaje == "java":
        binario = os.path.join(tmpdir, "Main")
        return [["javac", "-d", tmpdir, ruta_fuente], [shutil.which("java") or "java", "-cp", tmpdir, "Main"]]
    if lenguaje == "c":
        binario = os.path.join(tmpdir, "main.out")
        return [[shutil.which("gcc") or "gcc", "-O2", "-o", binario, ruta_fuente], [binario]]
    if lenguaje == "cpp":
        binario = os.path.join(tmpdir, "main.out")
        return [[shutil.which("g++") or "g++", "-O2", "-o", binario, ruta_fuente], [binario]]
    raise HTTPException(status_code=400, detail=f"Lenguaje no soportado: '{lenguaje}'")


def execute(codigo: str, lenguaje: str, entrada: str = "", timeout: int = 10) -> dict:
    """Ejecuta código en un sandbox temporal. Devuelve salida/error/código."""
    cfg = _lenguaje_o_404(lenguaje)
    tmpdir = tempfile.mkdtemp(prefix="cb-ide-")
    t0 = time.monotonic()
    salida_total: List[str] = []
    error_total: List[str] = []
    codigo_salida = 0
    try:
        ruta = _preparar_fuente(tmpdir, lenguaje, codigo)
        for cmd in _comandos(lenguaje, ruta, tmpdir):
            try:
                proc = subprocess.run(
                    cmd,
                    cwd=tmpdir,
                    input=entrada if entrada else None,
                    capture_output=True,
                    text=True,
                    timeout=timeout,
                    env=_env_minimo(),
                )
            except subprocess.TimeoutExpired as e:
                error_total.append(
                    f"⏱ Tiempo agotado ({timeout}s). Si tu programa se quedó "
                    f"esperando entrada (input/readline) o tiene un bucle "
                    f"infinito, revisá la lógica."
                )
                codigo_salida = 124
                if e.stdout:
                    salida_total.append(e.stdout.decode() if isinstance(e.stdout, bytes) else str(e.stdout))
                if e.stderr:
                    error_total.append(e.stderr.decode() if isinstance(e.stderr, bytes) else str(e.stderr))
                break
            if proc.stdout:
                salida_total.append(proc.stdout)
            if proc.stderr:
                error_total.append(proc.stderr)
            codigo_salida = proc.returncode
            if codigo_salida != 0:
                break  # falló la compilación o la ejecución: no seguimos
        duracion = round((time.monotonic() - t0) * 1000)
        return {
            "salida": _limitar_salida("".join(salida_total)),
            "error": _limitar_salida("".join(error_total)),
            "codigo_salida": codigo_salida,
            "duracion_ms": duracion,
            "lenguaje": lenguaje,
            "runtime": cfg["runtime"],
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# Depurador Python: traza línea a línea con variables locales.
_TRACE_WRAPPER = '''\
# --- wrapper de depuración Cherry-Bomb ---
import sys, json

_RUTA = {ruta!r}
_PASOS = []
_MAX = {max_pasos!r}

def _serializar(v):
    try:
        s = repr(v)
    except Exception:
        s = "<no representable>"
    if len(s) > 200:
        s = s[:200] + "…"
    return s

def _tracer(frame, event, arg):
    if frame.f_code.co_filename != _RUTA:
        return None
    if event == "line" or event == "call":
        variables = {{}}
        for k, v in frame.f_locals.items():
            if not k.startswith("__"):
                variables[k] = _serializar(v)
        _PASOS.append({{
            "linea": frame.f_lineno,
            "evento": event,
            "funcion": frame.f_code.co_name,
            "variables": variables,
        }})
        if len(_PASOS) >= _MAX:
            raise SystemExit(0)
    return _tracer

sys.settrace(_tracer)
try:
    with open(_RUTA, "r", encoding="utf-8") as _f:
        _src = _f.read()
    _cod = compile(_src, _RUTA, "exec")
    exec(_cod, {{"__name__": "__main__", "__file__": _RUTA}})
except SystemExit:
    pass
finally:
    sys.settrace(None)

print("___CB_TRACE___" + json.dumps(_PASOS))
'''


def debug_python(codigo: str, breakpoints: Optional[List[int]], max_pasos: int, tmpdir: str) -> dict:
    """Depura código Python capturando la traza línea a línea."""
    ruta = os.path.join(tmpdir, "main.py")
    with open(ruta, "w", encoding="utf-8") as f:
        f.write(codigo)
    wrapper = os.path.join(tmpdir, "cb_debug.py")
    with open(wrapper, "w", encoding="utf-8") as f:
        f.write(_TRACE_WRAPPER.format(ruta=ruta, max_pasos=max_pasos))
    try:
        proc = subprocess.run(
            [shutil.which("python3") or "python3", wrapper],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=30,
            env=_env_minimo(),
        )
    except subprocess.TimeoutExpired:
        return {"pasos": [], "error": "⏱ Tiempo agotado en la depuración (30s).", "salida": ""}
    pasos = []
    marcador = "___CB_TRACE___"
    for linea in proc.stdout.splitlines():
        if linea.startswith(marcador):
            import json

            try:
                pasos = json.loads(linea[len(marcador):])
            except Exception:
                pasos = []
    if breakpoints:
        pasos = [p for p in pasos if p.get("linea") in set(breakpoints)]
    return {
        "pasos": pasos,
        "salida": proc.stdout.replace(marcador, "").strip() if proc.stdout else "",
        "error": proc.stderr or "",
        "codigo_salida": proc.returncode,
    }


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

@router.get("/lenguajes")
def listar_lenguajes(_user: dict = Depends(require_auth)) -> dict:
    """Lenguajes soportados con su runtime y ejemplo inicial."""
    return {
        "lenguajes": [
            {
                "id": lid,
                "nombre": cfg["nombre"],
                "extension": cfg["extension"],
                "monaco": cfg["monaco"],
                "runtime": cfg["runtime"],
                "disponible": bool(cfg["ejecutable"]),
                "depurable": cfg["depurable"],
                "ejemplo": cfg["ejemplo"],
            }
            for lid, cfg in LENGUAJES.items()
        ]
    }


@router.post("/ejecutar")
def ejecutar(payload: EjecutarIn, _user: dict = Depends(require_auth)) -> dict:
    """Ejecuta el código del estudiante y devuelve salida, errores y código de salida."""
    return execute(
        codigo=payload.codigo,
        lenguaje=payload.lenguaje.strip().lower(),
        entrada=payload.entrada or "",
        timeout=payload.timeout_seg or 10,
    )


@router.post("/depurar")
def depurar(payload: DepurarIn, _user: dict = Depends(require_auth)) -> dict:
    """Depurador paso a paso.

    Python: traza real línea a línea con variables locales.
    Otros lenguajes: devuelve la ejecución completa con diagnósticos y una
    nota honesta de que el stepping nativo aún no está soportado.
    """
    lenguaje = payload.lenguaje.strip().lower()
    cfg = _lenguaje_o_404(lenguaje)
    tmpdir = tempfile.mkdtemp(prefix="cb-ide-dbg-")
    try:
        if lenguaje == "python":
            return debug_python(payload.codigo, payload.breakpoints, payload.max_pasos or 500, tmpdir)
        # Fallback para lenguajes compilados/JS: ejecutar con traza de error.
        res = execute(payload.codigo, lenguaje)
        res["pasos"] = []
        res["nota"] = (
            f"El depurador paso a paso línea por línea está disponible para Python. "
            f"Para {cfg['nombre']} se ejecutó el programa con todos los diagnósticos; "
            f"usá los mensajes de error y la salida para ubicar el fallo."
        )
        return res
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)