package com.tcm.inquiry.modules.consultation.sse;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tcm.inquiry.modules.consultation.dto.TcmDiagnosisReport;

class ConsultationJsonReportStreamSnifferTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parsesCompleteBlockAcrossChunks() {
        ConsultationJsonReportStreamSniffer sniffer = new ConsultationJsonReportStreamSniffer(mapper);
        List<TcmDiagnosisReport> out = new ArrayList<>();
        sniffer.append("前言\n```json-report\n", out::add);
        assertThat(out).isEmpty();
        sniffer.append(
                "{\"pattern\":\"气虚\",\"reasoning\":\"乏力\",\"formula\":\"四君子汤\",\"herbs\":[\"人参\"],\"lifestyle\":[\"早睡\"]}\n```\n尾",
                out::add);
        assertThat(out).hasSize(1);
        TcmDiagnosisReport r = out.get(0);
        assertThat(r.pattern()).isEqualTo("气虚");
        assertThat(r.formula()).isEqualTo("四君子汤");
        assertThat(r.herbs()).containsExactly("人参");
        assertThat(r.lifestyle()).containsExactly("早睡");
    }

    @Test
    void malformedJsonSkipsWithoutThrowing() {
        ConsultationJsonReportStreamSniffer sniffer = new ConsultationJsonReportStreamSniffer(mapper);
        List<TcmDiagnosisReport> out = new ArrayList<>();
        sniffer.append("```json-report\n{not json}\n```", out::add);
        assertThat(out).isEmpty();
    }

    @Test
    void noOpenFenceDoesNotAccumulateUnboundedIssue() {
        ConsultationJsonReportStreamSniffer sniffer = new ConsultationJsonReportStreamSniffer(mapper);
        List<TcmDiagnosisReport> out = new ArrayList<>();
        sniffer.append("plain only", out::add);
        assertThat(out).isEmpty();
    }
}
