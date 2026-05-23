/**
 * @fileoverview 知识库域类型：库/文档实体、检索结果与异步入库任务状态。
 */

/** GET /api/knowledge 返回的知识库摘要。 */
export type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  document_count: number;
  total_chunks?: number;
  embedding_provider?: string | null;
  embedding_model?: string | null;
  embedding_dim?: number | null;
};

/** 知识库内已入库的源文档。 */
export type KnowledgeDocument = {
  id: string;
  kb_id: string;
  filename: string;
  chunk_count: number;
  file_size: number;
  created_at: string;
};

/** POST /api/knowledge/{id}/search 单条命中。 */
export type SearchResult = {
  content: string;
  source: string;
  score: number;
};

/** 前端跟踪的单文件异步入库任务（含上传与服务端处理进度）。 */
export type IngestJobState = {
  kbId: string;
  filename: string;
  jobId: string;
  status: string;
  error?: string | null;
  fileBlob?: File;
  /** 上传阶段的字节进度（0-100），上传完成后为 undefined */
  uploadProgress?: number;
  /** 服务端处理阶段名称：extracting / chunking / embedding / writing / done */
  phase?: string;
  /** 服务端处理进度（0-100），来自后端 job 状态接口 */
  serverProgress?: number;
};

/** 轮询入库 job 状态的间隔（毫秒）。 */
export const JOB_POLL_MS = 2000;
/** 入库 job 终态集合（completed / failed）。 */
export const TERMINAL = new Set(["completed", "failed"]);
