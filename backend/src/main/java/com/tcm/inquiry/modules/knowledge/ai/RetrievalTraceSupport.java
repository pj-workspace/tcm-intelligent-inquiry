package com.tcm.inquiry.modules.knowledge.ai;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.tcm.inquiry.modules.knowledge.dto.resp.KnowledgeRetrievedPassage;

/** 问诊溯源：工具链多路召回合并、去重截断（持久化与 SSE meta 共用）。 */
public final class RetrievalTraceSupport {

    private RetrievalTraceSupport() {}

    /**
     * 按综合分降序，按 documentId|source 去重保留高分条目，取前 {@code limit} 条并重排 index。
     */
    public static List<KnowledgeRetrievedPassage> finalizeTop(List<KnowledgeRetrievedPassage> acc, int limit) {
        if (acc == null || acc.isEmpty() || limit <= 0) {
            return List.of();
        }
        Map<String, KnowledgeRetrievedPassage> best = new LinkedHashMap<>();
        for (KnowledgeRetrievedPassage p : acc) {
            String docId = p.documentId() != null ? p.documentId() : "";
            String src = p.source() != null ? p.source() : "";
            String key = docId + "\u0001" + src;
            best.merge(
                    key,
                    p,
                    (a, b) -> Double.compare(a.score(), b.score()) >= 0 ? a : b);
        }
        List<KnowledgeRetrievedPassage> ranked =
                best.values().stream()
                        .sorted(Comparator.comparingDouble(KnowledgeRetrievedPassage::score).reversed())
                        .limit(Math.max(1, limit))
                        .toList();

        List<KnowledgeRetrievedPassage> out = new ArrayList<>(ranked.size());
        int idx = 1;
        for (KnowledgeRetrievedPassage p : ranked) {
            out.add(
                    new KnowledgeRetrievedPassage(
                            idx,
                            p.documentId(),
                            p.source(),
                            p.matchType(),
                            roundScore(p.score()),
                            truncateExcerpt(p.excerpt()),
                            p.channel()));
            idx++;
        }
        return out;
    }

    private static double roundScore(double s) {
        return Math.round(s * 1000.0) / 1000.0;
    }

    private static String truncateExcerpt(String excerpt) {
        if (excerpt == null) {
            return "";
        }
        final int max = 4000;
        if (excerpt.length() <= max) {
            return excerpt;
        }
        return excerpt.substring(0, max) + "…";
    }
}
