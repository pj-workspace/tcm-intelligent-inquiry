package com.tcm.inquiry.modules.consultation.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class TcmSafetyGuardrailServiceTest {

    private final TcmSafetyGuardrailService svc = new TcmSafetyGuardrailService();

    @Test
    void ganCaoFanJingDaJi_withShengGanCao() {
        var r = svc.checkHerbIncompatibility(List.of("生甘草", "京大戟"));
        assertThat(r.safe()).isFalse();
        assertThat(r.warnings()).isNotEmpty();
        assertThat(String.join(" ", r.warnings())).contains("甘草");
    }

    @Test
    void wuTouFanBanXia() {
        var r = svc.checkHerbIncompatibility(List.of("制附子", "法半夏"));
        assertThat(r.safe()).isFalse();
    }

    @Test
    void singleHerb_safe() {
        var r = svc.checkHerbIncompatibility(List.of("炙甘草"));
        assertThat(r.safe()).isTrue();
        assertThat(r.warnings()).isEmpty();
    }

    @Test
    void emptyList_safe() {
        assertThat(svc.checkHerbIncompatibility(List.of()).safe()).isTrue();
        assertThat(svc.checkHerbIncompatibility(null).safe()).isTrue();
    }

    @Test
    void herbMatchesCanon_examples() {
        assertThat(TcmSafetyGuardrailService.herbMatchesCanon("生甘草", "甘草")).isTrue();
        assertThat(TcmSafetyGuardrailService.herbMatchesCanon("炙甘草", "甘草")).isTrue();
        assertThat(TcmSafetyGuardrailService.herbMatchesCanon("土贝母", "浙贝母")).isFalse();
    }
}
