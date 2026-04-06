package com.tcm.inquiry.modules.consultation.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "chat_messages")
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private ChatSession session;

    @Lob
    @Column(nullable = false)
    private String userMessage;

    @Lob
    @Column(nullable = false)
    private String assistantMessage;

    @Column(length = 256)
    private String modelName;

    private Double temperature;

    /** 可选：扩展生成参数（JSON 文本，如 temperature 结构或厂商特有字段）。 */
    @Lob
    private String generationParamsJson;

    /**
     * 可选：本轮 RAG 溯源摘录（与 SSE meta.passages 对齐，通常为 Top 3 的 JSON 数组）。
     * 单独列避免膨胀 assistant 正文，且利于历史加载时按需解析。
     */
    @Lob
    private String retrievalTraceJson;

    @Column(nullable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public ChatSession getSession() {
        return session;
    }

    public void setSession(ChatSession session) {
        this.session = session;
    }

    public String getUserMessage() {
        return userMessage;
    }

    public void setUserMessage(String userMessage) {
        this.userMessage = userMessage;
    }

    public String getAssistantMessage() {
        return assistantMessage;
    }

    public void setAssistantMessage(String assistantMessage) {
        this.assistantMessage = assistantMessage;
    }

    public String getModelName() {
        return modelName;
    }

    public void setModelName(String modelName) {
        this.modelName = modelName;
    }

    public Double getTemperature() {
        return temperature;
    }

    public void setTemperature(Double temperature) {
        this.temperature = temperature;
    }

    public String getGenerationParamsJson() {
        return generationParamsJson;
    }

    public void setGenerationParamsJson(String generationParamsJson) {
        this.generationParamsJson = generationParamsJson;
    }

    public String getRetrievalTraceJson() {
        return retrievalTraceJson;
    }

    public void setRetrievalTraceJson(String retrievalTraceJson) {
        this.retrievalTraceJson = retrievalTraceJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}
