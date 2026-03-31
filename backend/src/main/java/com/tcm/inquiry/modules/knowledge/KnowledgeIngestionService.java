package com.tcm.inquiry.modules.knowledge;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.UUID;

import org.springframework.ai.document.Document;
import org.springframework.ai.reader.tika.TikaDocumentReader;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.ai.vectorstore.VectorStore;
import org.springframework.ai.vectorstore.filter.FilterExpressionBuilder;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.tcm.inquiry.modules.knowledge.dto.KnowledgeFileView;

@Service
public class KnowledgeIngestionService {

    private final KnowledgeBaseRepository knowledgeBaseRepository;
    private final KnowledgeFileRepository knowledgeFileRepository;
    private final VectorStore vectorStore;
    private final KnowledgeProperties knowledgeProperties;
    private final VectorStoreFilterDeletion vectorStoreFilterDeletion;

    public KnowledgeIngestionService(
            KnowledgeBaseRepository knowledgeBaseRepository,
            KnowledgeFileRepository knowledgeFileRepository,
            VectorStore vectorStore,
            KnowledgeProperties knowledgeProperties,
            VectorStoreFilterDeletion vectorStoreFilterDeletion) {
        this.knowledgeBaseRepository = knowledgeBaseRepository;
        this.knowledgeFileRepository = knowledgeFileRepository;
        this.vectorStore = vectorStore;
        this.knowledgeProperties = knowledgeProperties;
        this.vectorStoreFilterDeletion = vectorStoreFilterDeletion;
    }

    @Transactional
    public KnowledgeFileView ingest(Long knowledgeBaseId, MultipartFile multipart, Integer chunkSizeOverride)
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

            int chunk =
                    chunkSizeOverride != null && chunkSizeOverride > 32
                            ? chunkSizeOverride
                            : knowledgeProperties.getChunkSize();

            TokenTextSplitter splitter =
                    TokenTextSplitter.builder()
                            .withChunkSize(chunk)
                            .withMinChunkSizeChars(knowledgeProperties.getMinChunkSizeChars())
                            .withMinChunkLengthToEmbed(knowledgeProperties.getMinChunkLengthToEmbed())
                            .withMaxNumChunks(knowledgeProperties.getMaxNumChunks())
                            .withKeepSeparator(knowledgeProperties.isKeepSeparator())
                            .build();

            List<Document> chunks = splitter.apply(loaded);
            for (Document d : chunks) {
                d.getMetadata().put("kb_id", kbIdStr);
                d.getMetadata().put("file_id", fileUuid);
                d.getMetadata().put("source", safeName);
            }

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
            KnowledgeFile saved = knowledgeFileRepository.save(row);

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
                f.getCreatedAt());
    }
}
