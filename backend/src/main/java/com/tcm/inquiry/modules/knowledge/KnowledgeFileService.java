package com.tcm.inquiry.modules.knowledge;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.tcm.inquiry.modules.knowledge.dto.KnowledgeFileView;

@Service
public class KnowledgeFileService {

    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final KnowledgeFileRepository knowledgeFileRepository;
    private final VectorStoreFilterDeletion vectorStoreFilterDeletion;

    public KnowledgeFileService(
            KnowledgeBaseRepository knowledgeBaseRepository,
            KnowledgeFileRepository knowledgeFileRepository,
            VectorStoreFilterDeletion vectorStoreFilterDeletion) {
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.knowledgeFileRepository = knowledgeFileRepository;
        this.vectorStoreFilterDeletion = vectorStoreFilterDeletion;
    }

    @Transactional(readOnly = true)
    public List<KnowledgeFileView> listFiles(Long knowledgeBaseId) {
        if (!knowledgeBaseRepository.existsById(knowledgeBaseId)) {
            throw new IllegalArgumentException("knowledge base not found: " + knowledgeBaseId);
        }
        return knowledgeFileRepository.findByKnowledgeBase_IdOrderByCreatedAtDesc(knowledgeBaseId).stream()
                .map(KnowledgeFileService::toView)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteFile(Long knowledgeBaseId, String fileUuid) {
        KnowledgeFile file =
                knowledgeFileRepository
                        .findByKnowledgeBase_IdAndFileUuid(knowledgeBaseId, fileUuid)
                        .orElseThrow(
                                () ->
                                        new IllegalArgumentException(
                                                "file not found in knowledge base: " + fileUuid));

        vectorStoreFilterDeletion.deleteByFilter(
                new FilterExpressionBuilder().eq("file_id", fileUuid).build());

        Path path = Paths.get(file.getStoredRelativePath()).normalize();
        try {
            Files.deleteIfExists(path);
        } catch (Exception ignored) {
            // 文件可能已手动删除
        }

        knowledgeFileRepository.delete(file);
    }

    private static KnowledgeFileView toView(KnowledgeFile f) {
        return new KnowledgeFileView(
                f.getId(),
                f.getOriginalFilename(),
                f.getFileUuid(),
                f.getSizeBytes(),
                f.getContentType(),
                f.getCreatedAt());
    }
}
