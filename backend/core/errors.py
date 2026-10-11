"""Errores uniformes del API (contrato §5.1 y §5.2).

Toda respuesta con estado >= 400 lleva::

    {"error": {"code": "...", "message": "..."}, "detail": "<igual que message>"}

`detail` se mantiene en **fase 1** de la migración (contrato §5.3): el
frontend es una PWA con caché, así que puede haber usuarios con un
`client.js` viejo que sólo sabe leer `detail`. Quitarlo exige aprobación
explícita y un PR aparte.
"""

from __future__ import annotations

import logging
import uuid
from typing import Dict, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("sakura.api")

# ----------------------------------------------------------------------
# Códigos (contrato §5.2)
# ----------------------------------------------------------------------

INVALID_ID = "invalid_id"
INVALID_PARAM = "invalid_param"
INVALID_REQUEST = "invalid_request"
AUTH_REQUIRED = "auth_required"
FORBIDDEN = "forbidden"
NOT_FOUND = "not_found"
CONFLICT = "conflict"
RATE_LIMITED = "rate_limited"
VALIDATION_ERROR = "validation_error"
INTERNAL_ERROR = "internal_error"
PROVIDER_ERROR = "provider_error"
TIMEOUT = "timeout"

# Fallback para las rutas que todavía levantan HTTPException "pelada".
CODE_BY_STATUS: Dict[int, str] = {
    400: INVALID_PARAM,
    401: AUTH_REQUIRED,
    403: FORBIDDEN,
    404: NOT_FOUND,
    405: INVALID_PARAM,
    409: CONFLICT,
    422: VALIDATION_ERROR,
    429: RATE_LIMITED,
    500: INTERNAL_ERROR,
    502: PROVIDER_ERROR,
    504: TIMEOUT,
}

# Mensajes por defecto, en español salvadoreño, por si la ruta no define uno.
MESSAGE_BY_STATUS: Dict[int, str] = {
    400: "Revisá los datos enviados",
    401: "Iniciá sesión para ver esto",
    403: "No tenés permiso para esto",
    404: "No se encontró el contenido",
    409: "Eso ya existe",
    422: "Faltan datos o los parámetros son incorrectos",
    429: "Demasiadas peticiones: esperá un momento",
    500: "Error interno del servidor",
    502: "YouTube Music no está disponible ahora mismo",
    504: "El servidor tardó demasiado en responder",
}

FALLBACK_MESSAGE = "Error inesperado"


class ApiError(Exception):
    """Error de aplicación con código estable y mensaje amigable."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.headers = dict(headers or {})


# ----------------------------------------------------------------------
# Cuerpo de respuesta
# ----------------------------------------------------------------------

def error_body(code: str, message: str) -> dict:
    """Contrato §5.1: `error` (nuevo) + `detail` (fase 1, retrocompatible)."""
    return {"error": {"code": code, "message": message}, "detail": message}


def request_id_of(request: Request) -> str:
    """Id de petición: el que mandó el cliente o uno generado (contrato §5.8)."""
    incoming = request.headers.get("x-request-id") or ""
    incoming = incoming.strip()[:64]
    return incoming or uuid.uuid4().hex[:16]


def _respond(
    request: Request,
    status_code: int,
    code: str,
    message: str,
    headers: Optional[Dict[str, str]] = None,
) -> JSONResponse:
    payload = error_body(code, message)
    payload["requestId"] = request_id_of(request)
    out_headers = {"X-Request-Id": payload["requestId"]}
    out_headers.update(headers or {})
    return JSONResponse(
        status_code=status_code, content=payload, headers=out_headers
    )


# ----------------------------------------------------------------------
# Handlers
# ----------------------------------------------------------------------

def _install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError) -> JSONResponse:  # noqa: ANN001
        if exc.status_code >= 500:
            log.warning("api_error code=%s status=%s path=%s", exc.code, exc.status_code, request.url.path)
        return _respond(request, exc.status_code, exc.code, exc.message, exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:  # noqa: ANN001
        status = exc.status_code
        code = CODE_BY_STATUS.get(status, INTERNAL_ERROR if status >= 500 else INVALID_PARAM)
        detail = exc.detail if isinstance(exc.detail, str) else MESSAGE_BY_STATUS.get(status, FALLBACK_MESSAGE)
        message = detail or MESSAGE_BY_STATUS.get(status, FALLBACK_MESSAGE)
        return _respond(request, status, code, message, dict(exc.headers or {}))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:  # noqa: ANN001
        # Sin esquema técnico: los errores de pydantic van crudos al cliente.
        return _respond(
            request,
            422,
            VALIDATION_ERROR,
            "Faltan datos o los parámetros son incorrectos",
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:  # noqa: ANN001, BLE001
        log.exception("error_no_manejado path=%s", request.url.path, exc_info=exc)
        return _respond(request, 500, INTERNAL_ERROR, "Error interno del servidor")


def install_exception_handlers(app: FastAPI) -> None:
    """Registra los handlers de error en formato uniforme."""
    _install(app)
