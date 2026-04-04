package com.tcm.inquiry.modules.agent.tools;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * {@code knowledge_retrieval_tool} 的入参：与模块二 RAG 对齐，由模型生成 JSON 映射为本类型。
 * <p>
 * {@link JsonAlias} 兼容部分模型偏好的 snake_case 字段名。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record KnowledgeRetrievalToolArgs(
        @JsonAlias("knowledge_base_id") Long knowledgeBaseId,
        String query,
        @JsonAlias("top_k") Integer topK,
        Double similarityThreshold) {}
