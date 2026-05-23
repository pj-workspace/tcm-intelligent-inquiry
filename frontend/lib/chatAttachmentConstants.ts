/**
 * @fileoverview 聊天附件上传约束常量（与后端 VL/OSS 校验对齐）。
 */

/** 单次发送前，待附带图片（及将来本地文件）合计上限 */
export const CHAT_PENDING_ATTACHMENT_MAX = 8;

/**
 * 与后端 `app.storage.aliyun.chat_image.MIN_IMAGE_EDGE_PX` 一致。
 * VL 接口要求宽高均须大于 10px，前端预筛与 Pillow 对齐，避免整张批次被一张坏图拖累。
 */
export const CHAT_IMAGE_MIN_EDGE_PX = 11;
