package com.tcm.inquiry.modules.literature.service;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

import org.springframework.ai.document.Document;
import org.springframework.ai.reader.tika.TikaDocumentReader;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.tcm.inquiry.modules.knowledge.ai.VectorStoreFilterDeletion;
import com.tcm.inquiry.modules.knowledge.ai.chunking.IngestionDocumentChunker;
import com.tcm.inquiry.modules.literature.config.LiteratureProperties;
import com.tcm.inquiry.modules.literature.dto.resp.LiteratureFileView;
import com.tcm.inquiry.modules.literature.entity.LiteratureUpload;
import com.tcm.inquiry.modules.literature.entity.LiteratureUploadStatus;
import com.tcm.inquiry.modules.literature.repository.LiteratureUploadRepository;
import com.tcm.inquiry.modules.literature.util.LiteratureFilenameUtil;

@Service
public class LiteratureIngestionService {

    private final LiteratureUploadRepository literatureUploadRepository;
    private final VectorStore vectorStore;
    private final LiteratureProperties literatureProperties;
    private final VectorStoreFilterDeletion vectorStoreFilterDeletion;
    private final IngestionDocumentChunker ingestionDocumentChunker;

    public LiteratureIngestionService(
            LiteratureUploadRepository literatureUploadRepository,
            VectorStore vectorStore,
            LiteratureProperties literatureProperties,
            VectorStoreFilterDeletion vectorStoreFilterDeletion,
            IngestionDocumentChunker ingestionDocumentChunker) {
        this.literatureUploadRepository = literatureUploadRepository;
        this.vectorStore = vectorStore;
        this.literatureProperties = literatureProperties;
        this.vectorStoreFilterDeletion = vectorStoreFilterDeletion;
        this.ingestionDocumentChunker = ingestionDocumentChunker;
    }

    /**
     * @param collectionId 为空则新建临时库 UUID；同一 ID 下可多次上传合并检索。
     */
    @Transactional
    public LiteratureFileView ingest(
            String collectionId,
            MultipartFile multipart,
            Integer chunkSizeOverride,
            Integer chunkOverlapOverride)
            throws IOException {
        if (multipart == null || multipart.isEmpty()) {
            throw new IllegalArgumentException("empty file");
        }

        String collection = collectionId == null || collectionId.isBlank() ? UUID.randomUUID().toString() : collectionId.trim();
        String fileUuid = UUID.randomUUID().toString();
        String safeName = LiteratureFilenameUtil.sanitize(multipart.getOriginalFilename());
        String diskName = fileUuid + "_" + safeName;

        Path storageRoot = Paths.get(literatureProperties.getStorageDir()).normalize();
        Path collDir = storageRoot.resolve(collection);
        Files.createDirectories(collDir);
        Path target = collDir.resolve(diskName);
        multipart.transferTo(target);

        String relativeStored =
                storageRoot.resolve(collection).resolve(diskName).toString().replace('\\', '/');

        try {
            TikaDocumentReader reader = new TikaDocumentReader(new FileSystemResource(target));
            List<Document> loaded = reader.get();
            if (loaded.isEmpty()) {
                throw new IllegalStateException("no text extracted from file");
            }

            List<Document> chunks =
                    ingestionDocumentChunker.chunk(loaded, chunkSizeOverride, chunkOverlapOverride);
            for (Document d : chunks) {
                d.getMetadata().put("lit_collection_id", collection);
                d.getMetadata().put("file_id", fileUuid);
                d.getMetadata().put("source", safeName);
            }

            vectorStore.add(chunks);

            LiteratureUpload row = new LiteratureUpload();
            row.setTempCollectionId(collection);
            row.setOriginalFilename(
                    multipart.getOriginalFilename() != null ? multipart.getOriginalFilename() : safeName);
            row.setFileUuid(fileUuid);
            row.setStoredRelativePath(relativeStored);
            row.setContentType(
                    multipart.getContentType() != null ? multipart.getContentType() : "application/octet-stream");
            row.setSizeBytes(multipart.getSize());
            row.setStatus(LiteratureUploadStatus.READY);
            // 滑动 TTL：从本次入库起算 vectorTtlHours；随后将同一 collection 内所有行对齐到该时刻
            int ttlH = Math.max(1, literatureProperties.getVectorTtlHours());
            Instant expiresAt = Instant.now().plus(Duration.ofHours(ttlH));
            row.setExpiresAt(expiresAt);
            LiteratureUpload saved = literatureUploadRepository.save(row);
            // 关键：多文件同一临时库共用一条「到期时间」，任意新上传都会整库顺延，避免用户边聊边传时中途被误删
            literatureUploadRepository.bumpExpiresAtForCollection(collection, expiresAt);

            return toView(saved);
        } catch (RuntimeException e) {
            Files.deleteIfExists(target);
            try {
                vectorStoreFilterDeletion.deleteByFilter(
                        new FilterExpressionBuilder().eq("file_id", fileUuid).build());
            } catch (Exception ignore) {
            }
            throw e;
        }
    }

    private static LiteratureFileView toView(LiteratureUpload u) {
        return new LiteratureFileView(
                u.getId(),
                u.getTempCollectionId(),
                u.getOriginalFilename(),
                u.getFileUuid() != null ? u.getFileUuid() : "",
                u.getSizeBytes() != null ? u.getSizeBytes() : 0L,
                u.getContentType() != null ? u.getContentType() : "application/octet-stream",
                u.getStatus(),
                u.getCreatedAt(),
                u.getExpiresAt());
    }
}
