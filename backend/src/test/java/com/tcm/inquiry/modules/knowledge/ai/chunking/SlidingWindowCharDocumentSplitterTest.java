package com.tcm.inquiry.modules.knowledge.ai.chunking;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.ai.document.Document;

class SlidingWindowCharDocumentSplitterTest {

    @Test
    void slidingWithOverlapYieldsMultipleChunks() {
        String repeated = "甲乙丙丁戊".repeat(80);
        List<Document> out =
                SlidingWindowCharDocumentSplitter.apply(
                        List.of(new Document(repeated)), 64, 16, 500, 1);
        assertThat(out).isNotEmpty();
        assertThat(out.size()).isGreaterThan(1);
    }

    @Test
    void emptyTextReturnsEmpty() {
        assertThat(
                        SlidingWindowCharDocumentSplitter.apply(
                                List.of(new Document("   ")), 100, 10, 10, 1))
                .isEmpty();
    }

    @Test
    void joinsMultipleLoadedDocuments() {
        List<Document> out =
                SlidingWindowCharDocumentSplitter.apply(
                        List.of(new Document("AAAA"), new Document("BBBB")), 3, 1, 20, 1);
        assertThat(out).isNotEmpty();
        String joined = String.join("", out.stream().map(Document::getText).toList());
        assertThat(joined).contains("A");
        assertThat(joined).contains("B");
    }
}
