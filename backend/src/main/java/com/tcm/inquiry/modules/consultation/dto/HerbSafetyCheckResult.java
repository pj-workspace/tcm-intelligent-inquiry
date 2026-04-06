package com.tcm.inquiry.modules.consultation.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 配伍禁忌自动审查结果（启发式规则，不可替代药师/医师审方）。
 */
@JsonInclude(JsonInclude.Include.NON_EMPTY)
public record HerbSafetyCheckResult(
        boolean safe,
        /** 人读警告文案，如「附子与半夏为十八反配伍禁忌」 */
        List<String> warnings) {

    public HerbSafetyCheckResult {
        warnings = warnings == null ? List.of() : List.copyOf(warnings);
    }

    public static HerbSafetyCheckResult ok() {
        return new HerbSafetyCheckResult(true, List.of());
    }
}
