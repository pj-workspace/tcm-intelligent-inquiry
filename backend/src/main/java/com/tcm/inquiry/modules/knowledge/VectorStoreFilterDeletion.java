package com.tcm.inquiry.modules.knowledge;

import java.util.List;
import java.util.Objects;

import org.springframework.ai.document.Document;
import org.springframework.ai.vectorstore.SearchRequest;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.Filter;
import org.springframework.stereotype.Component;

/**
 * SimpleVectorStore 不支持 {@link VectorStore#delete(Filter.Expression)}，通过先按 metadata
 * 过滤做相似度检索（query 仅占位）再按 id 批量删除。
 */
@Component
public class VectorStoreFilterDeletion {

    private static final int DELETE_MATCH_TOP_K = 50_000;

    private final VectorStore vectorStore;

    public VectorStoreFilterDeletion(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
    }

    public void deleteByFilter(Filter.Expression filterExpression) {
        SearchRequest request =
                SearchRequest.builder()
                        .query(".")
                        .topK(DELETE_MATCH_TOP_K)
                        .similarityThresholdAll()
                        .filterExpression(filterExpression)
                        .build();
        List<Document> matches = vectorStore.similaritySearch(request);
        List<String> ids =
                matches.stream()
                        .map(Document::getId)
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList();
        if (!ids.isEmpty()) {
            vectorStore.delete(ids);
        }
    }
}
