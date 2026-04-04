package com.tcm.inquiry.modules.agent;

import jakarta.validation.constraints.NotBlank;

/**
 * JSON：{@code POST /api/v1/agent/run}（{@code Content-Type: application/json}）。
 * 带图请用 {@code multipart/form-data} 同路径 {@code /run}。
 */
public record AgentRunRequest(
        @NotBlank String task,
        /** 已废弃：请用 multipart 上传图片 */
        @Deprecated String imagePath,
        Long knowledgeBaseId,
        Integer ragTopK,
        Double ragSimilarityThreshold,
        /**
         * 可选：JSON 随路传入的单张药材图 Base64；写入 ToolContext 供 {@code herb_image_recognition_tool} 调用视觉模型。
         */
        String herbImageBase64,
        /** 可选：与 herbImageBase64 对应的 MIME（如 image/png），缺省按 image/jpeg。 */
        String herbImageMimeType) {}
