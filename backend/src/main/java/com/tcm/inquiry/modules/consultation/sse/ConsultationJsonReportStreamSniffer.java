package com.tcm.inquiry.modules.consultation.sse;

import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tcm.inquiry.modules.consultation.dto.TcmDiagnosisReport;

/**
 * 在流式 token 拼接过程中识别闭合的 {@code ```json-report} 代码块，解析为 {@link TcmDiagnosisReport}；
 * 解析失败则丢弃该段并继续，不打断对话（正文已照常下发给客户端）。
 */
public final class ConsultationJsonReportStreamSniffer {

    private static final Logger log = LoggerFactory.getLogger(ConsultationJsonReportStreamSniffer.class);

    private static final String FENCE_OPEN = "```json-report";

    private final StringBuilder buf = new StringBuilder();
    private final ObjectMapper objectMapper;

    public ConsultationJsonReportStreamSniffer(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /**
     * 追加本轮 token；每形成一段完整闭合的 json-report 则回调一次（可多段，一般由模型只输出一段）。
     */
    public void append(String chunk, Consumer<TcmDiagnosisReport> onParsed) {
        if (chunk == null || chunk.isEmpty() || onParsed == null) {
            return;
        }
        buf.append(chunk);
        drainComplete(onParsed);
    }

    private void drainComplete(Consumer<TcmDiagnosisReport> onParsed) {
        while (true) {
            String s = buf.toString();
            int open = s.indexOf(FENCE_OPEN);
            if (open < 0) {
                return;
            }
            int nl = s.indexOf('\n', open);
            if (nl < 0) {
                return;
            }
            int close = s.indexOf("```", nl + 1);
            if (close < 0) {
                return;
            }
            String json = s.substring(nl + 1, close).trim();
            buf.delete(0, close + 3);
            if (json.isEmpty()) {
                continue;
            }
            try {
                TcmDiagnosisReport report = objectMapper.readValue(json, TcmDiagnosisReport.class);
                onParsed.accept(report);
            } catch (Exception e) {
                log.debug("json-report 解析跳过（模型输出损坏或非 JSON）: {}", e.getMessage());
            }
        }
    }
}
