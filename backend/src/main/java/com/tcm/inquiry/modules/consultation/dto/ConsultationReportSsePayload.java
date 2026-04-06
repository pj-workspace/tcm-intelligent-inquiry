package com.tcm.inquiry.modules.consultation.dto;

/**
 * SSE {@code report} 事件体：模型结构化摘要 + 配伍禁忌审查结果。
 */
public record ConsultationReportSsePayload(
        TcmDiagnosisReport report,
        HerbSafetyCheckResult safety) {}
