package com.tcm.inquiry.modules.knowledge.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tcm.knowledge")
public class KnowledgeProperties {

    private int chunkSize = 512;
    /** 默认重叠（码点）；为 0 表示入库走 Token 切分；上传可覆盖 */
    private int defaultChunkOverlapChars = 0;
    private int minChunkSizeChars = 60;
    private int minChunkLengthToEmbed = 20;
    private int maxNumChunks = 5000;
    private boolean keepSeparator = true;
    private int defaultTopK = 4;
    private double defaultSimilarityThreshold = 0.0;
    private String storageDir = "data/kb-files";

    public int getChunkSize() {
        return chunkSize;
    }

    public void setChunkSize(int chunkSize) {
        this.chunkSize = chunkSize;
    }

    public int getDefaultChunkOverlapChars() {
        return defaultChunkOverlapChars;
    }

    public void setDefaultChunkOverlapChars(int defaultChunkOverlapChars) {
        this.defaultChunkOverlapChars = defaultChunkOverlapChars;
    }

    public int getMinChunkSizeChars() {
        return minChunkSizeChars;
    }

    public void setMinChunkSizeChars(int minChunkSizeChars) {
        this.minChunkSizeChars = minChunkSizeChars;
    }

    public int getMinChunkLengthToEmbed() {
        return minChunkLengthToEmbed;
    }

    public void setMinChunkLengthToEmbed(int minChunkLengthToEmbed) {
        this.minChunkLengthToEmbed = minChunkLengthToEmbed;
    }

    public int getMaxNumChunks() {
        return maxNumChunks;
    }

    public void setMaxNumChunks(int maxNumChunks) {
        this.maxNumChunks = maxNumChunks;
    }

    public boolean isKeepSeparator() {
        return keepSeparator;
    }

    public void setKeepSeparator(boolean keepSeparator) {
        this.keepSeparator = keepSeparator;
    }

    public int getDefaultTopK() {
        return defaultTopK;
    }

    public void setDefaultTopK(int defaultTopK) {
        this.defaultTopK = defaultTopK;
    }

    public double getDefaultSimilarityThreshold() {
        return defaultSimilarityThreshold;
    }

    public void setDefaultSimilarityThreshold(double defaultSimilarityThreshold) {
        this.defaultSimilarityThreshold = defaultSimilarityThreshold;
    }

    public String getStorageDir() {
        return storageDir;
    }

    public void setStorageDir(String storageDir) {
        this.storageDir = storageDir;
    }
}
