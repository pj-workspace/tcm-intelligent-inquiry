package com.tcm.inquiry.modules.consultation.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * 问诊助手输出的结构化辨证建议（由模型在 ```json-report 代码块中给出，SSE 另以 {@code report} 事件下发）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record TcmDiagnosisReport(
        /** 证候 / 辨证结论；依据不足时用「信息不足」等占位，勿编造具体证名 */
        String pattern,
        /** 病机与辨证思路简述 */
        String reasoning,
        /** 建议参考的方剂名；无充分依据时可为 null 或空 */
        String formula,
        /** 组成药材名称 */
        List<String> herbs,
        /** 生活与调理建议条目 */
        List<String> lifestyle) {

    public TcmDiagnosisReport {
        herbs = herbs == null ? List.of() : List.copyOf(herbs);
        lifestyle = lifestyle == null ? List.of() : List.copyOf(lifestyle);
    }
}
