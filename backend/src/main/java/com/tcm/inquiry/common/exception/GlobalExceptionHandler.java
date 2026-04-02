package com.tcm.inquiry.common.exception;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import com.tcm.inquiry.common.api.ApiResult;
import com.tcm.inquiry.config.TcmApiProperties;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    private static final String GENERIC_SERVER_ERROR = "Internal error";
    private static final String GENERIC_IO = "IO error";
    private static final String GENERIC_BAD_REQUEST = "Bad request";

    private final TcmApiProperties apiProperties;

    public GlobalExceptionHandler(TcmApiProperties apiProperties) {
        this.apiProperties = apiProperties;
    }

    @ExceptionHandler(IOException.class)
    public ResponseEntity<ApiResult<Void>> handleIo(IOException ex) {
        log.debug("IOException in request handling", ex);
        String msg =
                apiProperties.isExposeErrorDetails()
                        ? (ex.getMessage() != null ? ex.getMessage() : GENERIC_IO)
                        : GENERIC_IO;
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResult.fail(400, msg));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResult<Void>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(
                        ApiResult.fail(
                                400,
                                ex.getMessage() != null ? ex.getMessage() : GENERIC_BAD_REQUEST));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResult<Void>> handleValidation(MethodArgumentNotValidException ex) {
        String msg =
                ex.getBindingResult().getFieldErrors().stream()
                        .findFirst()
                        .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
                        .orElse("validation error");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(ApiResult.fail(400, msg));
    }

    /**
     * 未匹配到 Controller 的 GET 等请求会落到静态资源解析；常见于后端版本过旧、缺少对应 API。
     * 统一为 404，避免被 {@link #handleException} 打成 500 且英文消息难以理解。
     */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResult<Void>> handleNoResource(NoResourceFoundException ex) {
        String path = ex.getResourcePath();
        String msg =
                apiProperties.isExposeErrorDetails()
                        ? ("无此接口或静态资源：" + path + "。若为 API，请确认后端已更新到包含该路径的版本。")
                        : "请求的资源或接口不存在";
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiResult.fail(404, msg));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResult<Void>> handleException(Exception ex) {
        log.error("Unhandled exception", ex);
        String msg =
                apiProperties.isExposeErrorDetails()
                        ? (ex.getMessage() != null ? ex.getMessage() : GENERIC_SERVER_ERROR)
                        : GENERIC_SERVER_ERROR;
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResult.fail(500, msg));
    }
}
