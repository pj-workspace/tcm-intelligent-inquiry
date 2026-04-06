package com.tcm.inquiry.modules.consultation.dto;

import java.time.Instant;
import java.util.List;

import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeRetrievedPassage;

/** 会话中单轮问答（用户句 + 助手完整回复）的只读视图。 */
public record ChatMessageView(
        Long id,
        String userMessage,
        String assistantMessage,
        String modelName,
        Double temperature,
        Instant createdAt,
        /** 与当时 SSE meta.passages 一致的溯源摘录；旧数据可能为空列表 */
        List<KnowledgeRetrievedPassage> retrievalPassages) {}
