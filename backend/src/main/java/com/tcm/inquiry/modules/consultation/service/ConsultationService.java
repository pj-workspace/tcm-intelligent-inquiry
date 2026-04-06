package com.tcm.inquiry.modules.consultation.service;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tcm.inquiry.modules.consultation.dto.ChatMessageView;
import com.tcm.inquiry.modules.consultation.dto.ChatSessionResponse;
import com.tcm.inquiry.modules.consultation.entity.ChatMessage;
import com.tcm.inquiry.modules.consultation.entity.ChatSession;
import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeRetrievedPassage;
import com.tcm.inquiry.modules.consultation.repository.ChatMessageRepository;
import com.tcm.inquiry.modules.consultation.repository.ChatSessionRepository;

@Service
public class ConsultationService {

    private static final String DEFAULT_TITLE = "新会话";

    private static final TypeReference<List<KnowledgeRetrievedPassage>> PASSAGES_TYPE =
            new TypeReference<>() {};

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ObjectMapper objectMapper;

    public ConsultationService(
            ChatSessionRepository chatSessionRepository,
            ChatMessageRepository chatMessageRepository,
            ObjectMapper objectMapper) {
        this.chatSessionRepository = chatSessionRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ChatSessionResponse createSession(String title) {
        ChatSession session = new ChatSession();
        session.setTitle(StringUtils.hasText(title) ? title.trim() : DEFAULT_TITLE);
        ChatSession saved = chatSessionRepository.save(session);
        return toResponse(saved);
    }

    /** 列出会话，按最近更新时间倒序。 */
    @Transactional(readOnly = true)
    public List<ChatSessionResponse> listSessions() {
        return chatSessionRepository.findAllByOrderByUpdatedAtDesc().stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<ChatMessageView> listMessages(Long sessionId) {
        if (!chatSessionRepository.existsById(sessionId)) {
            throw new IllegalArgumentException("session not found: " + sessionId);
        }
        return chatMessageRepository.findBySession_IdOrderByIdAsc(sessionId).stream()
                .map(this::toMessageView)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteSession(Long sessionId) {
        if (!chatSessionRepository.existsById(sessionId)) {
            throw new IllegalArgumentException("session not found: " + sessionId);
        }
        chatMessageRepository.deleteAllBySession_Id(sessionId);
        chatSessionRepository.deleteById(sessionId);
    }

    private ChatMessageView toMessageView(ChatMessage m) {
        List<KnowledgeRetrievedPassage> passages = List.of();
        String raw = m.getRetrievalTraceJson();
        if (StringUtils.hasText(raw)) {
            try {
                passages = objectMapper.readValue(raw.trim(), PASSAGES_TYPE);
            } catch (Exception ignored) {
                passages = List.of();
            }
        }
        return new ChatMessageView(
                m.getId(),
                m.getUserMessage(),
                m.getAssistantMessage(),
                m.getModelName(),
                m.getTemperature(),
                m.getCreatedAt(),
                passages == null ? List.of() : passages);
    }

    private ChatSessionResponse toResponse(ChatSession s) {
        return new ChatSessionResponse(s.getId(), s.getTitle(), s.getCreatedAt(), s.getUpdatedAt());
    }
}
