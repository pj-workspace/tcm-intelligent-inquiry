package com.tcm.inquiry.modules.knowledge.ai.chunking;

import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.Document;
import org.springframework.ai.transformer.splitter.TokenTextSplitter;
import org.springframework.stereotype.Component;

import com.tcm.inquiry.modules.knowledge.config.KnowledgeProperties;

/**
 * 入库切分编排：策略选择 ——
 * <ul>
 *   <li>{@code chunkOverlap <= 0}：沿用 Spring AI {@link TokenTextSplitter}（按 <b>token</b> 估算分块，与历史行为一致）</li>
 *   <li>{@code chunkOverlap > 0}：启用 {@link SlidingWindowCharDocumentSplitter}（按 <b>Unicode 码点</b> 滑动窗口，{@code chunkSize} 表示窗口长度）</li>
 * </ul>
 */
@Component
public class IngestionDocumentChunker {

    private static final Logger log = LoggerFactory.getLogger(IngestionDocumentChunker.class);

    private final KnowledgeProperties knowledgeProperties;

    public IngestionDocumentChunker(KnowledgeProperties knowledgeProperties) {
        this.knowledgeProperties = knowledgeProperties;
    }

    /**
     * @param loaded            解析后的全文 {@link Document}
     * @param chunkSizeOverride 前端上传的 chunkSize；无重叠模式为 <b>token</b> 上限，有重叠模式为 <b>码点窗口</b> 长度
     * @param chunkOverlapOverride 前端上传的 chunkOverlap（码点）；null 时使用配置默认
     */
    public List<Document> chunk(List<Document> loaded, Integer chunkSizeOverride, Integer chunkOverlapOverride) {
        int chunkSize =
                chunkSizeOverride != null && chunkSizeOverride > 32
                        ? chunkSizeOverride
                        : knowledgeProperties.getChunkSize();

        int overlap =
                chunkOverlapOverride != null
                        ? chunkOverlapOverride
                        : knowledgeProperties.getDefaultChunkOverlapChars();

        if (overlap <= 0) {
            return tokenSplit(loaded, chunkSize);
        }

        // —— 滑动窗口模式：chunkSize 表示码点窗口；必须与 overlap 区分单位说明（见 API / 前端文案） ——
        if (chunkSize < 64) {
            throw new IllegalArgumentException("启用重叠切分时，chunkSize 表示码点窗口长度，须 >= 64");
        }
        if (overlap >= chunkSize) {
            throw new IllegalArgumentException("chunkOverlap 必须小于 chunkSize（码点窗口长度）");
        }

        List<Document> chunks =
                SlidingWindowCharDocumentSplitter.apply(
                        loaded,
                        chunkSize,
                        overlap,
                        knowledgeProperties.getMaxNumChunks(),
                        knowledgeProperties.getMinChunkLengthToEmbed());

        if (chunks.isEmpty()) {
            throw new IllegalStateException("滑动窗口切分未产生有效切片，请调大窗口或降低 min-chunk-length-to-embed");
        }

        log.debug(
                "使用滑动窗口切分：windowCp={} overlapCp={} chunks={}",
                chunkSize,
                overlap,
                chunks.size());
        return chunks;
    }

    private List<Document> tokenSplit(List<Document> loaded, int chunkTokens) {
        TokenTextSplitter splitter =
                TokenTextSplitter.builder()
                        .withChunkSize(chunkTokens)
                        .withMinChunkSizeChars(knowledgeProperties.getMinChunkSizeChars())
                        .withMinChunkLengthToEmbed(knowledgeProperties.getMinChunkLengthToEmbed())
                        .withMaxNumChunks(knowledgeProperties.getMaxNumChunks())
                        .withKeepSeparator(knowledgeProperties.isKeepSeparator())
                        .build();
        return splitter.apply(loaded);
    }
}
