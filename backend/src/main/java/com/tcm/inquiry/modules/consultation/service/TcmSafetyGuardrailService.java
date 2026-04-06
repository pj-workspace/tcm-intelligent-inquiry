package com.tcm.inquiry.modules.consultation.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import com.tcm.inquiry.modules.consultation.dto.HerbSafetyCheckResult;

/**
 * 基于《神农本草经》以来流传的「十八反」「十九畏」歌诀的<strong>内置字面规则库</strong>，对药材列表做配伍禁忌扫描。
 * <p>
 * 匹配策略：炮制名剥除 + 尾缀匹配，使「生甘草」「炙甘草」等可归并为「甘草」，同时避免单字与过短串误匹配以降低误报。
 * </p>
 */
@Service
public class TcmSafetyGuardrailService {

    /** 常见炮制 / 炮姜等前缀，按长度降序尝试剥除（多轮）。 */
    private static final List<String> PROCESSING_PREFIXES_SORTED =
            List.of(
                            "蜜炙",
                            "盐炙",
                            "酒炙",
                            "醋炙",
                            "姜炙",
                            "麸炒",
                            "炒炭",
                            "煅",
                            "炒",
                            "炙",
                            "制",
                            "酒",
                            "醋",
                            "蜜",
                            "盐",
                            "姜",
                            "生")
                    .stream()
                    .sorted(Comparator.comparingInt(String::length).reversed())
                    .toList();

    private record IncompatibilityPair(String label, List<String> sideA, List<String> sideB) {}

    /**
     * 十八反、十九畏经典成对禁忌（侧 A 与侧 B 同时出现于同一处方药材列表时报警；方向对称处理）。
     * 药物名尽量用药典通行称谓；具体品种争议处从宽收录常用饮片名。
     */
    private static final List<IncompatibilityPair> PAIRS =
            List.of(
                    // --- 十八反 ---
                    new IncompatibilityPair(
                            "十八反：乌头类反半夏、瓜蒌、贝母、白蔹、白及",
                            List.of(
                                    "川乌",
                                    "草乌",
                                    "附子",
                                    "乌头",
                                    "制川乌",
                                    "制草乌",
                                    "黑顺片",
                                    "白附片",
                                    "炮附片"),
                            List.of(
                                    "半夏",
                                    "法半夏",
                                    "清半夏",
                                    "姜半夏",
                                    "瓜蒌",
                                    "瓜蒌皮",
                                    "瓜蒌子",
                                    "全瓜蒌",
                                    "天花粉",
                                    "川贝母",
                                    "浙贝母",
                                    "平贝母",
                                    "伊贝母",
                                    "湖北贝母",
                                    "白蔹",
                                    "白及")),
                    new IncompatibilityPair(
                            "十八反：甘草反甘遂、大戟、海藻、芫花",
                            List.of("甘草"),
                            List.of("甘遂", "大戟", "京大戟", "红大戟", "海藻", "芫花")),
                    new IncompatibilityPair(
                            "十八反：藜芦反诸参、细辛、芍药",
                            List.of("藜芦"),
                            List.of(
                                    "人参",
                                    "西洋参",
                                    "南沙参",
                                    "北沙参",
                                    "丹参",
                                    "玄参",
                                    "苦参",
                                    "细辛",
                                    "白芍",
                                    "赤芍",
                                    "芍药")),
                    // --- 十九畏 ---
                    new IncompatibilityPair(
                            "十九畏：硫黄畏芒硝（朴硝）",
                            List.of("硫黄", "硫磺"),
                            List.of("芒硝", "朴硝", "玄明粉")),
                    new IncompatibilityPair("十九畏：水银畏砒霜", List.of("水银"), List.of("砒霜")),
                    new IncompatibilityPair("十九畏：狼毒畏密陀僧", List.of("狼毒"), List.of("密陀僧")),
                    new IncompatibilityPair(
                            "十九畏：巴豆畏牵牛",
                            List.of("巴豆", "巴豆霜"),
                            List.of("牵牛子", "黑丑", "白丑")),
                    new IncompatibilityPair("十九畏：丁香畏郁金", List.of("丁香", "母丁香"), List.of("郁金")),
                    new IncompatibilityPair(
                            "十九畏：牙硝畏三棱",
                            List.of("芒硝", "朴硝", "牙硝", "玄明粉"),
                            List.of("三棱", "荆三棱", "黑三棱")),
                    new IncompatibilityPair(
                            "十九畏：川乌、草乌畏犀角",
                            List.of("川乌", "草乌", "附子", "制川乌", "制草乌"),
                            List.of("犀角", "犀牛角")),
                    new IncompatibilityPair("十九畏：人参畏五灵脂", List.of("人参", "党参"), List.of("五灵脂")),
                    new IncompatibilityPair(
                            "十九畏：官桂畏赤石脂",
                            List.of("肉桂", "官桂"),
                            List.of("赤石脂")));

    /**
     * 扫描 {@code herbs} 中是否存在与内置规则冲突的药对。
     *
     * @param herbs 模型或用户给出的药材名列表；null/空则视为安全
     */
    public HerbSafetyCheckResult checkHerbIncompatibility(List<String> herbs) {
        if (herbs == null || herbs.isEmpty()) {
            return HerbSafetyCheckResult.ok();
        }

        List<String> cleaned = new ArrayList<>();
        for (String h : herbs) {
            if (StringUtils.hasText(h)) {
                cleaned.add(h.trim());
            }
        }
        if (cleaned.isEmpty()) {
            return HerbSafetyCheckResult.ok();
        }

        Set<String> warnings = new LinkedHashSet<>();
        int n = cleaned.size();
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                String a = cleaned.get(i);
                String b = cleaned.get(j);
                for (IncompatibilityPair pair : PAIRS) {
                    if ( spansSides(a, b, pair)) {
                        warnings.add(
                                pair.label()
                                        + "（检出："
                                        + a
                                        + " 与 "
                                        + b
                                        + "，仅供参考）");
                    }
                }
            }
        }

        if (warnings.isEmpty()) {
            return HerbSafetyCheckResult.ok();
        }
        return new HerbSafetyCheckResult(false, new ArrayList<>(warnings));
    }

    /** 无序药对 (h1,h2) 是否分别命中规则两侧。 */
    private static boolean spansSides(String herb1, String herb2, IncompatibilityPair pair) {
        return (matchesAnyCanon(herb1, pair.sideA()) && matchesAnyCanon(herb2, pair.sideB()))
                || (matchesAnyCanon(herb1, pair.sideB()) && matchesAnyCanon(herb2, pair.sideA()));
    }

    private static boolean matchesAnyCanon(String raw, List<String> canons) {
        for (String c : canons) {
            if (herbMatchesCanon(raw, c)) {
                return true;
            }
        }
        return false;
    }

    /**
     * {@code raw} 饮片名是否与规则药物 {@code canon} 指同一基原（启发式）。
     * 策略：去空白 → 反复剥除炮制前缀 → 全等或尾缀匹配（规范名长度≥2）。
     */
    static boolean herbMatchesCanon(String raw, String canon) {
        if (!StringUtils.hasText(raw) || !StringUtils.hasText(canon)) {
            return false;
        }
        String n = normalizeHerbToken(raw);
        String c = normalizeHerbToken(canon);
        if (n.isEmpty() || c.isEmpty()) {
            return false;
        }
        // 土贝母 vs 川贝母：尾缀「贝母」会误报，显式排除
        if (c.endsWith("贝母") && n.startsWith("土贝")) {
            return false;
        }
        if (n.equals(c)) {
            return true;
        }
        if (c.length() >= 2 && n.endsWith(c)) {
            return true;
        }
        // 少数「全名包含规范名」且规范名较长时（如 瓜蒌子 含 瓜蒌 — 实际以尾缀为准；瓜蒌子不以瓜蒌结尾）
        if (c.length() >= 2 && n.contains(c) && n.length() <= c.length() + 2) {
            return n.startsWith(c) || n.endsWith(c);
        }
        return false;
    }

    static String normalizeHerbToken(String s) {
        String t =
                Objects.requireNonNull(s)
                        .trim()
                        .replaceAll("\\s+", "")
                        .replaceAll("[（）()\\[\\]【】]", "");
        t = stripProcessingPrefixes(t);
        return t;
    }

    private static String stripProcessingPrefixes(String input) {
        String t = input;
        for (int round = 0; round < 8; round++) {
            final String before = t;
            for (String p : PROCESSING_PREFIXES_SORTED) {
                if (t.startsWith(p) && t.length() > p.length()) {
                    t = t.substring(p.length());
                    break;
                }
            }
            if (t.equals(before)) {
                break;
            }
        }
        return t;
    }
}
