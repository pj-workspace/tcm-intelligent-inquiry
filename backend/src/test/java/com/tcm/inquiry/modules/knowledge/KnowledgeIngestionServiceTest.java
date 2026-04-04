package com.tcm.inquiry.modules.knowledge;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.web.multipart.MultipartFile;

import com.tcm.inquiry.modules.knowledge.ai.VectorStoreFilterDeletion;
import com.tcm.inquiry.modules.knowledge.ai.chunking.IngestionDocumentChunker;
import com.tcm.inquiry.modules.knowledge.config.KnowledgeProperties;
import com.tcm.inquiry.modules.knowledge.entity.KnowledgeBase;
import com.tcm.inquiry.modules.knowledge.repository.KnowledgeBaseRepository;
import com.tcm.inquiry.modules.knowledge.repository.KnowledgeFileRepository;
import com.tcm.inquiry.modules.knowledge.service.KnowledgeIngestionService;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class KnowledgeIngestionServiceTest {

    @Mock private KnowledgeBaseRepository knowledgeBaseRepository;
    @Mock private KnowledgeFileRepository knowledgeFileRepository;
    @Mock private org.springframework.ai.vectorstore.VectorStore vectorStore;
    @Mock private KnowledgeProperties knowledgeProperties;
    @Mock private VectorStoreFilterDeletion vectorStoreFilterDeletion;
    @Mock private IngestionDocumentChunker ingestionDocumentChunker;

    private KnowledgeIngestionService ingestionService;

    @BeforeEach
    void setUp() {
        when(knowledgeProperties.getStorageDir()).thenReturn("target/test-kb-files");
        when(knowledgeProperties.getChunkSize()).thenReturn(512);
        ingestionService =
                new KnowledgeIngestionService(
                        knowledgeBaseRepository,
                        knowledgeFileRepository,
                        vectorStore,
                        knowledgeProperties,
                        vectorStoreFilterDeletion,
                        ingestionDocumentChunker);
    }

    @Test
    void ingestThrowsWhenBaseMissing() {
        when(knowledgeBaseRepository.findById(1L)).thenReturn(Optional.empty());
        MultipartFile file = mock(MultipartFile.class);

        assertThatThrownBy(() -> ingestionService.ingest(1L, file, null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("knowledge base not found");
    }

    @Test
    void ingestThrowsWhenFileEmpty() {
        KnowledgeBase kb = new KnowledgeBase();
        kb.setId(1L);
        when(knowledgeBaseRepository.findById(1L)).thenReturn(Optional.of(kb));
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(true);

        assertThatThrownBy(() -> ingestionService.ingest(1L, file, null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("empty file");
    }
}
