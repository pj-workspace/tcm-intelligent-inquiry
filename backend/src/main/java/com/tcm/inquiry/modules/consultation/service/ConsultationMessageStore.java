package com.tcm.inquiry.modules.consultation.service;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.tcm.inquiry.modules.consultation.entity.ChatMessage;
import com.tcm.inquiry.modules.consultation.entity.ChatSession;
import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeRetrievedPassage;
import com.tcm.inquiry.modules.consultation.repository.ChatMessageRepository;
import com.tcm.inquiry.modules.consultation.repository.ChatSessionRepository;

/**
 * 问诊消息持久化；供流式结束后的异步/非 Web 线程调用，独立事务提交。
 */
@Service
public class ConsultationMessageStore {

    private static final Logger log = LoggerFactory.getLogger(ConsultationMessageStore.class);

    /** 用于将 topP 等扩展采样参数序列化到 {@link ChatMessage#getGenerationParamsJson()}，便于审计与排障。 */
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private static final String DEFAULT_SESSION_TITLE = "新会话";
    private static final int TITLE_MAX_LEN = 30;

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;

    public ConsultationMessageStore(
            ChatSessionRepository chatSessionRepository,
            ChatMessageRepository chatMessageRepository) {
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
    }

    @Transactional
    public void saveTurn(
            Long sessionId,
            String userText,
            String assistantText,
            String modelName,
            Double temperature,
            Double topP) {
        saveTurn(sessionId, userText, assistantText, modelName, temperature, topP, null);
    }

    @Transactional
    public void saveTurn(
            Long sessionId,
            String userText,
            String assistantText,
            String modelName,
            Double temperature,
            Double topP,
            List<KnowledgeRetrievedPassage> retrievalPassages) {
        ChatSession session =
                chatSessionRepository.findById(sessionId).orElseThrow();

        if (DEFAULT_SESSION_TITLE.equals(session.getTitle())
                && chatMessageRepository.countBySession_Id(sessionId) == 0) {
            session.setTitle(truncateTitle(userText));
        }

        ChatMessage row = new ChatMessage();
        row.setSession(session);
        row.setUserMessage(userText);
        row.setAssistantMessage(assistantText);
        row.setModelName(modelName);
        row.setTemperature(temperature);
        // 将本轮实际使用的 Top-P 写入扩展 JSON，与 temperature 列并存，便于对照推理请求参数。
        if (topP != null) {
            try {
                ObjectNode node = OBJECT_MAPPER.createObjectNode();
                node.put("topP", topP);
                row.setGenerationParamsJson(OBJECT_MAPPER.writeValueAsString(node));
            } catch (JsonProcessingException e) {
                log.warn("序列化 generationParamsJson 失败 sessionId={}", sessionId, e);
            }
        }
        if (retrievalPassages != null && !retrievalPassages.isEmpty()) {
            try {
                row.setRetrievalTraceJson(OBJECT_MAPPER.writeValueAsString(retrievalPassages));
            } catch (JsonProcessingException e) {
                log.warn("序列化 retrievalTraceJson 失败 sessionId={}", sessionId, e);
            }
        }
        row.setCreatedAt(Instant.now());
        chatMessageRepository.save(row);

        session.setUpdatedAt(Instant.now());
        chatSessionRepository.save(session);
    }

    private static String truncateTitle(String text) {
        String t = text.replace('\n', ' ').trim();
        if (t.isEmpty()) {
            return DEFAULT_SESSION_TITLE;
        }
        if (t.length() <= TITLE_MAX_LEN) {
            return t;
        }
        return t.substring(0, TITLE_MAX_LEN) + "…";
    }
}
