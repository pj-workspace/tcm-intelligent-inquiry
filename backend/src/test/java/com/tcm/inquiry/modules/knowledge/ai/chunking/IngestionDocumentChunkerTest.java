package com.tcm.inquiry.modules.knowledge.ai.chunking;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.ai.document.Document;

import com.tcm.inquiry.modules.knowledge.config.KnowledgeProperties;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class IngestionDocumentChunkerTest {

    @Mock private KnowledgeProperties knowledgeProperties;

    private IngestionDocumentChunker chunker;

    @BeforeEach
    void setUp() {
        chunker = new IngestionDocumentChunker(knowledgeProperties);
    }

    @Test
    void rejectsOverlapNotSmallerThanWindow() {
        List<Document> loaded = List.of(new Document("x".repeat(200)));
        assertThatThrownBy(() -> chunker.chunk(loaded, 100, 100))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("chunkOverlap");
    }

    @Test
    void rejectsSmallWindowWhenOverlapEnabled() {
        List<Document> loaded = List.of(new Document("hello world test data"));
        assertThatThrownBy(() -> chunker.chunk(loaded, 50, 10))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("64");
    }
}
