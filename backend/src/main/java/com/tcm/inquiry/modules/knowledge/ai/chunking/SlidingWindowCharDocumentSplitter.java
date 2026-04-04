package com.tcm.inquiry.modules.knowledge.ai.chunking;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.springframework.ai.document.Document;

/**
 * 字符（Unicode 码点）滑动窗口切分策略：用于在 Spring AI {@code TokenTextSplitter} 未提供 overlap 时，
 * 由业务侧实现「窗口 + 重叠」的 RAG 切片，对中文等多字节字符安全（按码点步进，避免截断代理对）。
 */
public final class SlidingWindowCharDocumentSplitter {

    private SlidingWindowCharDocumentSplitter() {}

    /**
     * @param loaded            Tika 等 Reader 产出的原始 {@link Document} 列表（可多条，将按顺序拼接）
     * @param windowCodePoints  每个切片最多包含的码点数（窗口长度）
     * @param overlapCodePoints 相邻切片在码点上重叠的长度，须小于窗口长度
     * @param maxChunks         单文件切片数量上限，与全局 {@code tcm.knowledge.max-num-chunks} 对齐
     * @param minSegmentCodePoints 过短切片丢弃阈值，与 {@code min-chunk-length-to-embed} 语义一致（按码点计）
     */
    public static List<Document> apply(
            List<Document> loaded,
            int windowCodePoints,
            int overlapCodePoints,
            int maxChunks,
            int minSegmentCodePoints) {
        if (loaded == null || loaded.isEmpty()) {
            return List.of();
        }
        String full =
                loaded.stream()
                        .map(Document::getText)
                        .filter(Objects::nonNull)
                        .map(String::strip)
                        .filter(s -> !s.isEmpty())
                        .collect(Collectors.joining("\n\n"))
                        .strip();
        if (full.isEmpty()) {
            return List.of();
        }

        int window = Math.min(Math.max(windowCodePoints, 64), 32_000);
        int overlap = Math.min(Math.max(overlapCodePoints, 0), window - 1);
        int step = window - overlap;
        int minSeg = Math.max(1, minSegmentCodePoints);

        int[] cps = full.codePoints().toArray();
        Map<String, Object> baseMeta = baseMetadata(loaded);

        List<Document> out = new ArrayList<>();
        for (int start = 0; start < cps.length && out.size() < maxChunks; ) {
            int end = Math.min(cps.length, start + window);
            String raw = substringByCodePoints(cps, start, end);
            String segment = raw.strip();
            int segCp = segment.isEmpty() ? 0 : segment.codePointCount(0, segment.length());
            if (segCp >= minSeg) {
                out.add(new Document(segment, new HashMap<>(baseMeta)));
            }
            if (end >= cps.length) {
                break;
            }
            start += step;
        }
        return out;
    }

    private static Map<String, Object> baseMetadata(List<Document> loaded) {
        for (Document d : loaded) {
            Map<String, Object> m = d.getMetadata();
            if (m != null && !m.isEmpty()) {
                return new HashMap<>(m);
            }
        }
        return new HashMap<>();
    }

    private static String substringByCodePoints(int[] cps, int startInclusive, int endExclusive) {
        StringBuilder sb = new StringBuilder();
        for (int i = startInclusive; i < endExclusive; i++) {
            sb.appendCodePoint(cps[i]);
        }
        return sb.toString();
    }
}
