package com.tcm.inquiry.common.sse;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * claw-code / Anthropic 风格助手侧流式事件：通过命名事件 {@code assistant} 与 JSON 内 {@code type}
 * 区分正文增量（{@code text_delta}）与后续可扩展的 {@code message_stop} 等。
 */
public final class SseAssistantEvents {

    private SseAssistantEvents() {}

    /** 与 claw-code {@code ContentBlockDelta} 中 {@code text_delta} 语义对齐。 */
    public static void sendTextDelta(SseEmitter emitter, String text) throws IOException {
        if (text == null || text.isEmpty()) {
            return;
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "text_delta");
        payload.put("text", text);
        emitter.send(SseEmitter.event().name("assistant").data(payload));
    }

    /** 与 claw-code {@code AssistantEvent::MessageStop} 对齐，在 {@code [DONE]} 之前发送。 */
    public static void sendMessageStop(SseEmitter emitter) throws IOException {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "message_stop");
        emitter.send(SseEmitter.event().name("assistant").data(payload));
    }

    /**
     * 工具生命周期（claw-code {@code AssistantEvent::ToolUse} 的简化 wire）：无独立 tool id，
     * 用 {@code phase}=start|end 表示起止。
     */
    public static void sendToolUseLifecycle(
            SseEmitter emitter, String toolName, String phase, String detail) throws IOException {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("type", "tool_use");
        payload.put("name", toolName);
        payload.put("phase", phase);
        if (detail != null && !detail.isBlank()) {
            payload.put("input_preview", truncate(detail, 240));
        }
        emitter.send(SseEmitter.event().name("assistant").data(payload));
    }

    private static String truncate(String s, int maxChars) {
        String t = s.trim();
        if (t.length() <= maxChars) {
            return t;
        }
        return t.substring(0, maxChars) + "…";
    }
}
