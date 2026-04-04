package com.tcm.inquiry.modules.agent.tools;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * {@code herb_image_recognition_tool} 的入参：支持纯文字描述、或 Base64 图像 + MIME（亦可通过 {@link
 * org.springframework.ai.chat.model.ToolContext} 注入会话级附图）。
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record HerbImageRecognitionToolArgs(
        @JsonAlias("textual_description") String textualDescription,
        @JsonAlias("image_base64") String imageBase64,
        @JsonAlias("mime_type") String mimeType) {}
