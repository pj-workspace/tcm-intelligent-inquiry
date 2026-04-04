package com.tcm.inquiry.modules.knowledge.service;

import java.io.IOException;
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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.tcm.inquiry.modules.knowledge.ai.VectorStoreFilterDeletion;
import com.tcm.inquiry.modules.knowledge.ai.chunking.IngestionDocumentChunker;
import com.tcm.inquiry.modules.knowledge.config.KnowledgeProperties;
import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeFileView;
import com.tcm.inquiry.modules.knowledge.entity.KnowledgeBase;
import com.tcm.inquiry.modules.knowledge.entity.KnowledgeFile;
import com.tcm.inquiry.modules.knowledge.repository.KnowledgeBaseRepository;
import com.tcm.inquiry.modules.knowledge.repository.KnowledgeFileRepository;
import com.tcm.inquiry.modules.knowledge.util.KnowledgeFilenameUtil;

@Service
public class KnowledgeIngestionService {

    private static final Logger log = LoggerFactory.getLogger(KnowledgeIngestionService.class);

    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final KnowledgeFileRepository knowledgeFileRepository;
    private final VectorStore vectorStore;
    private final KnowledgeProperties knowledgeProperties;
    private final VectorStoreFilterDeletion vectorStoreFilterDeletion;
    private final IngestionDocumentChunker ingestionDocumentChunker;

    public KnowledgeIngestionService(
            KnowledgeBaseRepository knowledgeBaseRepository,
            KnowledgeFileRepository knowledgeFileRepository,
            VectorStore vectorStore,
            KnowledgeProperties knowledgeProperties,
            VectorStoreFilterDeletion vectorStoreFilterDeletion,
            IngestionDocumentChunker ingestionDocumentChunker) {
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.knowledgeFileRepository = knowledgeFileRepository;
        this.vectorStore = vectorStore;
        this.knowledgeProperties = knowledgeProperties;
        this.vectorStoreFilterDeletion = vectorStoreFilterDeletion;
        this.ingestionDocumentChunker = ingestionDocumentChunker;
    }

    @Transactional
    public KnowledgeFileView ingest(
            Long knowledgeBaseId,
            MultipartFile multipart,
            Integer chunkSizeOverride,
            Integer chunkOverlapOverride)
            throws IOException {
        KnowledgeBase kb =
                knowledgeBaseRepository
                        .findById(knowledgeBaseId)
                        .orElseThrow(() -> new IllegalArgumentException("knowledge base not found: " + knowledgeBaseId));

        if (multipart.isEmpty()) {
            throw new IllegalArgumentException("empty file");
        }

        String fileUuid = UUID.randomUUID().toString();
        String safeName = KnowledgeFilenameUtil.sanitize(multipart.getOriginalFilename());
        String diskName = fileUuid + "_" + safeName;

        Path storageRoot = Paths.get(knowledgeProperties.getStorageDir()).normalize();
        Path kbDir = storageRoot.resolve(knowledgeBaseId.toString());
        Files.createDirectories(kbDir);
        Path target = kbDir.resolve(diskName);
        multipart.transferTo(target);

        String kbIdStr = String.valueOf(knowledgeBaseId);
        String relativeStored =
                storageRoot.resolve(knowledgeBaseId.toString()).resolve(diskName).toString().replace('\\', '/');

        try {
            TikaDocumentReader reader = new TikaDocumentReader(new FileSystemResource(target));
            List<Document> loaded = reader.get();
            if (loaded.isEmpty()) {
                throw new IllegalStateException("no text extracted from file");
            }

            int overlapEff =
                    chunkOverlapOverride != null
                            ? chunkOverlapOverride
                            : knowledgeProperties.getDefaultChunkOverlapChars();
            int chunk =
                    chunkSizeOverride != null && chunkSizeOverride > 32
                            ? chunkSizeOverride
                            : knowledgeProperties.getChunkSize();

            List<Document> chunks = ingestionDocumentChunker.chunk(loaded, chunkSizeOverride, chunkOverlapOverride);
            for (Document d : chunks) {
                d.getMetadata().put("kb_id", kbIdStr);
                d.getMetadata().put("file_id", fileUuid);
                d.getMetadata().put("source", safeName);
            }

            // 先落 Redis 向量索引，再写 MySQL 元数据；失败时外层 catch 会删盘文件并 best-effort 删向量
            vectorStore.add(chunks);

            KnowledgeFile row = new KnowledgeFile();
            row.setKnowledgeBase(kb);
            row.setOriginalFilename(
                    multipart.getOriginalFilename() != null
                            ? multipart.getOriginalFilename()
                            : safeName);
            row.setFileUuid(fileUuid);
            row.setStoredRelativePath(relativeStored);
            row.setContentType(
                    multipart.getContentType() != null ? multipart.getContentType() : "application/octet-stream");
            row.setSizeBytes(multipart.getSize());
            // 管理端「向量化状态」：记录实际写入向量库的切片条数
            row.setEmbedChunkCount(chunks.size());
            KnowledgeFile saved = knowledgeFileRepository.save(row);

            log.info(
                    "知识库入库完成 kbId={} file={} chunks={} chunkSizeParam={} overlapChars={}",
                    knowledgeBaseId,
                    safeName,
                    chunks.size(),
                    chunk,
                    overlapEff);

            return toView(saved);
        } catch (RuntimeException e) {
            Files.deleteIfExists(target);
            try {
                vectorStoreFilterDeletion.deleteByFilter(
                        new FilterExpressionBuilder().eq("file_id", fileUuid).build());
            } catch (Exception ignore) {
                // best-effort rollback vectors
            }
            throw e;
        }
    }

    private static KnowledgeFileView toView(KnowledgeFile f) {
        return new KnowledgeFileView(
                f.getId(),
                f.getOriginalFilename(),
                f.getFileUuid(),
                f.getSizeBytes(),
                f.getContentType(),
                f.getEmbedChunkCount(),
                f.getCreatedAt());
    }
}
