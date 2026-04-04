package com.tcm.inquiry.modules.knowledge;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.tcm.inquiry.config.TcmApiPropertiesConfig;
import com.tcm.inquiry.modules.knowledge.ai.KnowledgeRagService;
import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeFileView;
import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeQueryResponse;
import com.tcm.inquiry.modules.knowledge.entity.KnowledgeBase;
import com.tcm.inquiry.modules.knowledge.service.KnowledgeFileService;
import com.tcm.inquiry.modules.knowledge.service.KnowledgeIngestionService;
import com.tcm.inquiry.modules.knowledge.service.KnowledgeService;

@WebMvcTest(KnowledgeController.class)
@Import(TcmApiPropertiesConfig.class)
class KnowledgeControllerWebMvcTest {

    @Autowired private MockMvc mockMvc;

    @MockBean private KnowledgeService knowledgeService;
    @MockBean private KnowledgeIngestionService knowledgeIngestionService;
    @MockBean private KnowledgeFileService knowledgeFileService;
    @MockBean private KnowledgeRagService knowledgeRagService;

    @Test
    void healthOk() throws Exception {
        mockMvc.perform(get("/api/v1/knowledge/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data").value("knowledge"));
    }

    @Test
    void listBases() throws Exception {
        KnowledgeBase kb = new KnowledgeBase();
        kb.setId(1L);
        kb.setName("t");
        org.mockito.Mockito.when(knowledgeService.listBases()).thenReturn(List.of(kb));

        mockMvc.perform(get("/api/v1/knowledge/bases"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data[0].id").value(1))
                .andExpect(jsonPath("$.data[0].name").value("t"));
    }

    @Test
    void queryReturnsAnswer() throws Exception {
        org.mockito.Mockito.when(
                        knowledgeRagService.query(eq(1L), any()))
                .thenReturn(new KnowledgeQueryResponse("hi", List.of("a.pdf"), 1));

        mockMvc.perform(
                        post("/api/v1/knowledge/bases/1/query")
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"message\":\"q\",\"topK\":3}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.answer").value("hi"));
    }

    @Test
    void uploadDocumentDelegatesToIngestion() throws Exception {
        org.mockito.Mockito.when(
                        knowledgeIngestionService.ingest(eq(1L), any(), any(), any()))
                .thenReturn(
                        new KnowledgeFileView(
                                1L, "f.pdf", "uuid-1", 100, "application/pdf", 3, Instant.now()));

        mockMvc.perform(
                        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart(
                                        "/api/v1/knowledge/bases/1/documents")
                                .file(new org.springframework.mock.web.MockMultipartFile(
                                        "file", "f.pdf", "application/pdf", "x".getBytes())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fileUuid").value("uuid-1"))
                .andExpect(jsonPath("$.data.embedChunkCount").value(3));
    }
}
