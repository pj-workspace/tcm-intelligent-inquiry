"""全局自定义异常体系。

所有业务异常继承 AppError，HTTP 层统一捕获并转换为 JSON 响应。
"""

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """业务异常基类。"""

    status_code: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(self, message: str, *, code: str | None = None):
        """Create an error with optional override ``code``.

        Args:
            message: Human-readable error text returned to clients.
            code: Optional machine-readable code; defaults to class ``code``.
        """
        super().__init__(message)
        self.message = message
        if code:
            self.code = code


class NotFoundError(AppError):
    """HTTP 404 — requested resource does not exist."""
    status_code = 404
    code = "NOT_FOUND"


class ValidationError(AppError):
    """HTTP 422 — input failed business validation."""
    status_code = 422
    code = "VALIDATION_ERROR"


class UnauthorizedError(AppError):
    """HTTP 401 — authentication required or invalid."""
    status_code = 401
    code = "UNAUTHORIZED"


class ForbiddenError(AppError):
    """HTTP 403 — authenticated but not permitted."""
    status_code = 403
    code = "FORBIDDEN"


class ConflictError(AppError):
    """HTTP 409 — state conflict (duplicate, stale version, etc.)."""
    status_code = 409
    code = "CONFLICT"


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Map ``AppError`` subclasses to uniform JSON ``{code, message}`` responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )
