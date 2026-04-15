package com.tcm.inquiry.modules.consultation;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.tcm.inquiry.config.TcmApiProperties;
import com.tcm.inquiry.modules.consultation.dto.ConsultationChatRequest;
import com.tcm.inquiry.modules.agent.service.AgentService;

import com.tcm.inquiry.modules.consultation.service.ConsultationChatService;
import com.tcm.inquiry.modules.consultation.service.ConsultationMessageStore;
import com.tcm.inquiry.modules.consultation.repository.ChatMessageRepository;
import com.tcm.inquiry.modules.consultation.repository.ChatSessionRepository;

import java.util.concurrent.Executor;

@ExtendWith(MockitoExtension.class)
class ConsultationChatServiceTest {

    @Mock private org.springframework.ai.chat.model.ChatModel chatModel;
    @Mock private ChatSessionRepository chatSessionRepository;
    @Mock private ChatMessageRepository chatMessageRepository;
    @Mock private ConsultationMessageStore consultationMessageStore;
    @Mock private Executor sseAsyncExecutor;
    @Mock private TcmApiProperties apiProperties;
    @Mock private AgentService agentService;

    @InjectMocks private ConsultationChatService consultationChatService;

    @Test
    void streamChatRejectsMissingSession() {
        when(chatSessionRepository.existsById(99L)).thenReturn(false);
        ConsultationChatRequest req = new ConsultationChatRequest();
        req.setSessionId(99L);
        req.setMessage("x");

        assertThatThrownBy(() -> consultationChatService.streamChat(req))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("session not found");
    }
}
