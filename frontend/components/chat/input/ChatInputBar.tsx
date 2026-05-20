"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import clsx from "clsx";
import { motion, AnimatePresence } from "framer-motion";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as HoverCard from "@radix-ui/react-hover-card";
import * as Select from "@radix-ui/react-select";
import {
  Plus,
  ChevronDown,
  PenLine,
  BookOpen,
  Leaf,
  Brain,
  Globe,
  Check,
  Stethoscope,
  HeartPulse,
  Apple,
  Moon,
  Sun,
  Wind,
  Sparkles,
  ScrollText,
  ThermometerSun,
  Activity,
  type LucideIcon,
  Image as ImageIcon,
  FileText,
  X,
  ArrowUpRight,
  Bot,
} from "lucide-react";
import {
  SYSTEM_AGENT_LABEL,
  SYSTEM_AGENT_SELECT_VALUE,
} from "@/lib/chatAgentConstants";
import type { GenerationState } from "@/types/chat";
import type { ChatModelCatalogResponse } from "@/types/models";
import type { ChatSurfacePhase } from "@/types/chat-ui";
import { CHAT_PENDING_ATTACHMENT_MAX } from "@/lib/chatAttachmentConstants";
import type { RoundTokensUsage } from "@/components/chat/input/RoundTokensHint";
import { RoundTokensHint } from "@/components/chat/input/RoundTokensHint";
import { ChatSendControls } from "@/components/chat/input/ChatSendControls";

export type ChatInputBarUsageHint = {
  usage: RoundTokensUsage;
  variant: "round" | "conversation";
};

/** Select value 内分隔厂商 id 与模型 id（避免与模型名冲突） */
const MODEL_PICK_SEP = "\u001f";

const springTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

/** 与 AssistantBubble 追问条入场一致 */
const followUpSoftEase = [0.33, 1, 0.68, 1] as const;
const FOLLOW_UP_ENTER_FAST_BY = 0.4;
const followUpEnterSecs = (base: number) =>
  Math.max(0.14, Number((base - FOLLOW_UP_ENTER_FAST_BY).toFixed(2)));
const followUpExitSnap = { duration: 0.04, ease: "linear" as const };

/** 首屏输入区上方每次随机展示条数 */
const QUICK_PROMPT_SHOW_COUNT = 5;

type QuickPromptItem = {
  title: string;
  subtitle: string;
  prompt: string;
  Icon: LucideIcon;
  iconClassName: string;
};

const QUICK_PROMPT_POOL: QuickPromptItem[] = [
  {
    title: "症状自查",
    subtitle: "睡眠、疲乏等常见问题",
    prompt: "我最近总是失眠多梦，该怎么调理？",
    Icon: PenLine,
    iconClassName: "text-blue-500",
  },
  {
    title: "方剂查询",
    subtitle: "经典方功效与须知",
    prompt: "六味地黄丸的功效和禁忌是什么？",
    Icon: BookOpen,
    iconClassName: "text-emerald-600",
  },
  {
    title: "节气养生",
    subtitle: "四时饮食起居建议",
    prompt: "春季养肝有什么好的食疗建议？",
    Icon: Leaf,
    iconClassName: "text-orange-500",
  },
  {
    title: "体质辨识",
    subtitle: "平和、气虚、阴虚等",
    prompt: "怕冷又容易累，从中医角度可能是什么体质？日常怎么调养？",
    Icon: Activity,
    iconClassName: "text-violet-600",
  },
  {
    title: "舌脉科普",
    subtitle: "了解诊察含义",
    prompt: "舌苔厚腻在中医里一般说明什么？需要注意什么？",
    Icon: Stethoscope,
    iconClassName: "text-sky-600",
  },
  {
    title: "情志调摄",
    subtitle: "压力、焦虑与肝郁",
    prompt: "工作压力大、容易烦躁胸闷，中医有哪些简单的调理思路？",
    Icon: Wind,
    iconClassName: "text-teal-600",
  },
  {
    title: "食疗药膳",
    subtitle: "安全与搭配原则",
    prompt: "脾胃虚弱的人适合常吃哪些家常菜？有哪些需要少吃的？",
    Icon: Apple,
    iconClassName: "text-rose-600",
  },
  {
    title: "作息与节律",
    subtitle: "睡眠与子午流注",
    prompt: "经常熬夜伤肝吗？中医对作息有什么讲究？",
    Icon: Moon,
    iconClassName: "text-indigo-600",
  },
  {
    title: "四季起居",
    subtitle: "顺应寒热",
    prompt: "三伏天容易中暑乏力，中医养生要注意什么？",
    Icon: Sun,
    iconClassName: "text-amber-600",
  },
  {
    title: "经典条文",
    subtitle: "《内经》等入门",
    prompt: "用通俗的话解释一下「未病先防」在《黄帝内经》里是什么意思？",
    Icon: ScrollText,
    iconClassName: "text-stone-600",
  },
  {
    title: "感冒分型",
    subtitle: "风寒风热辨要点",
    prompt: "流清涕、怕冷无汗，在中医里常见于哪种感冒类型？该怎样护理？",
    Icon: ThermometerSun,
    iconClassName: "text-orange-600",
  },
  {
    title: "脾胃养护",
    subtitle: "纳呆、腹胀",
    prompt: "饭后容易腹胀嗳气，中医认为可能是什么问题？饮食方面怎么改善？",
    Icon: HeartPulse,
    iconClassName: "text-red-600",
  },
  {
    title: "穴位保健",
    subtitle: "日常按揉常识",
    prompt: "经常久坐颈肩酸胀，有哪几个常用的保健穴位可以自己按揉？",
    Icon: Sparkles,
    iconClassName: "text-fuchsia-600",
  },
  {
    title: "药食禁忌",
    subtitle: "合理进补",
    prompt: "感冒发烧期间，饮食上中医一般建议避免什么？",
    Icon: BookOpen,
    iconClassName: "text-green-700",
  },
];

function pickRandomPrompts(pool: QuickPromptItem[], count: number): QuickPromptItem[] {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(count, copy.length));
}

/** SSR 与水合首帧必须与服务端 HTML 完全一致，禁止使用 random */
function initialQuickPromptsForHydration(): QuickPromptItem[] {
  return QUICK_PROMPT_POOL.slice(0, QUICK_PROMPT_SHOW_COUNT);
}

function AttachmentUploadSkeletonTile({ progress }: { progress: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const pctLabel = p >= 1 ? 100 : Number((p * 100).toFixed(1));
  const r = 12.5;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - p);

  return (
    <div
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-zinc-100"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-label={`上传进度 ${pctLabel}%`}
      style={{ contain: "layout style paint" }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.85] attachment-upload-skeleton-shimmer" />
      <div className="absolute inset-0 flex items-center justify-center bg-white/[0.28]">
        <svg
          width="52"
          height="52"
          viewBox="0 0 36 36"
          className="-rotate-90 shrink-0 text-gray-900 [transition:none]"
          aria-hidden
        >
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke="#e4e4e7"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="pointer-events-none absolute tabular-nums text-[11px] font-semibold leading-none tracking-tight text-gray-800 drop-shadow-[0_0_1px_rgba(255,255,255,0.9)]">
          {pctLabel}%
        </span>
      </div>
    </div>
  );
}

type ChatInputBarProps = {
  input: string;
  hasStarted: boolean;
  genState: GenerationState;
  deepThinkEnabled: boolean;
  webSearchEnabled: boolean;
  webSearchMode: "force" | "auto";
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
  onToggleDeepThink: () => void;
  onToggleWebSearch: () => void;
  onSetWebSearchMode: (mode: "force" | "auto") => void;
  modelCatalog: ChatModelCatalogResponse | null;
  selectedProviderId: string;
  selectedModelId: string;
  onSelectModel: (providerId: string, modelId: string) => void;
  attachmentDisabled: boolean;
  /** 禁用时展示的说明（如「无模型列表」「非多模态」） */
  attachmentDisabledReason?: string;
  deepThinkDisabledByModel: boolean;
  webSearchDisabledByModel: boolean;
  /** 已选入待发送的图片（OSS URL） */
  pendingImageUrls: string[];
  onRemovePendingImage: (index: number) => void;
  /** 与其它添加方式共用：选择文件或粘贴截图 */
  onImageFilesSelected: (files: FileList | readonly File[] | null) => void;
  attachmentUploadBusy: boolean;
  /** 本轮正在上传的文件个数，用于骨架占位 */
  attachmentUploadSkeletonCount: number;
  /** 与骨架占位同序，每项 0~1，并行上传时每格各自进度 */
  attachmentUploadSlotProgress: number[];
  /** 有待发送图片时一键发送预制提示（会使用当前 pending 图片列表） */
  onSendWithImagePrompt?: (prompt: string) => void;
  /** VL 看图生成快捷话术；仅在后端返回后展示，无前端的本地假文案 */
  fetchAiImageQuickPrompts?: (
    urls: string[],
    signal: AbortSignal,
  ) => Promise<{ label: string; prompt: string }[] | null>;
  placeholder?: string;
  /** 输入区用量提示（本轮 SSE / 本会话库累计） */
  usageHint?: ChatInputBarUsageHint | null;
  /** 与主区阶段联动，避免恢复态误显快捷卡 */
  chatSurfacePhase?: ChatSurfacePhase;
  /** 已登录时展示 Agent 选择 */
  showAgentPicker?: boolean;
  agents?: { id: string; name: string }[];
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string | null) => void;
  agentsLoading?: boolean;
};

export function ChatInputBar({
  input,
  hasStarted,
  genState,
  deepThinkEnabled,
  webSearchEnabled,
  webSearchMode,
  inputRef,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
  onToggleDeepThink,
  onToggleWebSearch,
  onSetWebSearchMode,
  modelCatalog,
  selectedProviderId,
  selectedModelId,
  onSelectModel,
  attachmentDisabled,
  attachmentDisabledReason,
  deepThinkDisabledByModel,
  webSearchDisabledByModel,
  pendingImageUrls,
  onRemovePendingImage,
  onImageFilesSelected,
  attachmentUploadBusy,
  attachmentUploadSkeletonCount,
  attachmentUploadSlotProgress,
  onSendWithImagePrompt,
  fetchAiImageQuickPrompts,
  placeholder = "有问题，尽管问，Shift+Enter 换行",
  usageHint = null,
  chatSurfacePhase = "ready",
  showAgentPicker = false,
  agents = [],
  selectedAgentId = null,
  onSelectAgent,
  agentsLoading = false,
}: ChatInputBarProps) {
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const imgSuggestAbortRef = useRef<AbortController | null>(null);
  /** 与上一轮 effect 对比：仅在「本轮上传 attachmentUploadBusy: true→false」后才考虑拉 VL 话术 */
  const prevAttachBusyRef = useRef(attachmentUploadBusy);
  /** 当前输入区还有待发图期间只拉一次建议；清空附图后复位，再次上传可走首轮逻辑 */
  const attachmentSuggestFetchedForStackRef = useRef(false);
  const hasSendableContent = input.trim().length > 0 || pendingImageUrls.length > 0;
  const sendBlocked =
    genState !== "idle" || attachmentUploadBusy || !hasSendableContent;
  const attachmentAtCap = pendingImageUrls.length >= CHAT_PENDING_ATTACHMENT_MAX;

  const selectedProv = modelCatalog?.providers.find(
    (p) => p.id === selectedProviderId.trim(),
  );
  const selectedRow = selectedProv?.models.find(
    (m) => m.id === selectedModelId.trim(),
  );

  const fallbackPickValue = useMemo(() => {
    if (!modelCatalog?.providers?.length) return "";
    const p =
      modelCatalog.providers.find((x) => x.configured) ??
      modelCatalog.providers[0];
    const m = p?.models.find((x) => x.default) ?? p?.models[0];
    if (!p?.id || !m?.id) return "";
    return `${p.id}${MODEL_PICK_SEP}${m.id}`;
  }, [modelCatalog]);

  const pickValue =
    selectedProviderId.trim() && selectedModelId.trim()
      ? `${selectedProviderId.trim()}${MODEL_PICK_SEP}${selectedModelId.trim()}`
      : "";

  const selectCompositeValue = pickValue || fallbackPickValue;

  /** 粘贴剪贴板图片：与点击添加共用上传逻辑（非图片或未拦截时仍可正常粘贴文字） */
  const handleComposerPaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (attachmentDisabled || genState !== "idle" || attachmentUploadBusy || attachmentAtCap)
        return;

      const dt = e.clipboardData;
      if (!dt) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind !== "file") continue;
        const f = item.getAsFile();
        if (f && f.type.startsWith("image/")) imageFiles.push(f);
      }
      if (imageFiles.length === 0 && dt.files?.length) {
        for (let i = 0; i < dt.files.length; i++) {
          const f = dt.files.item(i);
          if (f && f.type.startsWith("image/")) imageFiles.push(f);
        }
      }

      if (imageFiles.length === 0) return;

      e.preventDefault();
      onImageFilesSelected(imageFiles);
    },
    [
      attachmentAtCap,
      attachmentDisabled,
      attachmentUploadBusy,
      genState,
      onImageFilesSelected,
    ],
  );

  /** 首屏五张大卡：仅新对话工作台且无待传图、无输入文字、未在上传时展示 */
  const showLandingQuickPromptCards =
    chatSurfacePhase === "newChat" &&
    pendingImageUrls.length === 0 &&
    !attachmentUploadBusy &&
    attachmentUploadSkeletonCount === 0 &&
    !input.trim();

  const [quickPromptChoices, setQuickPromptChoices] = useState<QuickPromptItem[]>(
    initialQuickPromptsForHydration
  );
  const [imgQuickChoices, setImgQuickChoices] = useState<{ label: string; prompt: string }[]>([]);
  /** 每次成功拉到非空推荐后递增，便于 AnimatePresence 重新播放入场动效 */
  const [imgQuickTrayAnimKey, setImgQuickTrayAnimKey] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQuickPromptChoices(pickRandomPrompts(QUICK_PROMPT_POOL, QUICK_PROMPT_SHOW_COUNT));
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const wasBusyBeforeThisRun = prevAttachBusyRef.current;

    if (pendingImageUrls.length === 0) {
      imgSuggestAbortRef.current?.abort();
      imgSuggestAbortRef.current = null;
      setImgQuickChoices([]);
      attachmentSuggestFetchedForStackRef.current = false;
      prevAttachBusyRef.current = attachmentUploadBusy;
      return;
    }

    if (attachmentUploadBusy) {
      imgSuggestAbortRef.current?.abort();
      imgSuggestAbortRef.current = null;
      prevAttachBusyRef.current = attachmentUploadBusy;
      return;
    }

    /** 仅在「本轮上传结束」后对当前待发图栈拉一次；继续加图不重拉；清空后再上传可再拉一次 */
    const uploadJustFinished =
      wasBusyBeforeThisRun && pendingImageUrls.length > 0;
    prevAttachBusyRef.current = attachmentUploadBusy;

    if (!uploadJustFinished || !onSendWithImagePrompt) {
      return;
    }

    if (attachmentSuggestFetchedForStackRef.current) {
      return;
    }
    attachmentSuggestFetchedForStackRef.current = true;

    if (!fetchAiImageQuickPrompts) {
      return;
    }

    imgSuggestAbortRef.current?.abort();
    const ac = new AbortController();
    imgSuggestAbortRef.current = ac;

    void (async () => {
      try {
        const rows = await fetchAiImageQuickPrompts(pendingImageUrls, ac.signal);
        if (ac.signal.aborted) return;
        if (rows && rows.length > 0) {
          setImgQuickChoices(rows.slice(0, 3));
          setImgQuickTrayAnimKey((k) => k + 1);
        } else {
          setImgQuickChoices([]);
        }
      } catch {
        if (!ac.signal.aborted) setImgQuickChoices([]);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [pendingImageUrls, attachmentUploadBusy, fetchAiImageQuickPrompts, onSendWithImagePrompt]);
  return (
    <motion.div
      transition={springTransition}
      className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center bg-gradient-to-t from-[#fdfdfc] from-45% via-[#fdfdfc]/96 to-transparent px-4 pb-5 pt-4 md:px-8"
    >
      <div className="relative w-full max-w-3xl lg:max-w-4xl xl:max-w-5xl">
        {/* 首屏五大快捷卡片：仅在输入区「无图且无字」且无上传中时展示 */}
        <AnimatePresence mode="popLayout">
          {showLandingQuickPromptCards && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="no-scrollbar mb-3 flex flex-wrap gap-2 sm:flex-nowrap sm:snap-x sm:snap-mandatory sm:overflow-x-auto pb-0.5"
            >
              {quickPromptChoices.map((item) => {
                const { Icon } = item;
                return (
                  <motion.button
                    key={item.prompt}
                    type="button"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onInputChange(item.prompt)}
                    className="w-max max-w-[min(20rem,calc(100vw-5rem))] shrink-0 snap-start rounded-xl border border-[#e5e5e5] bg-white/95 px-3 py-2 text-left shadow-sm transition-colors hover:border-gray-300 hover:bg-white sm:max-w-[min(21rem,calc((100vw-7rem)/2))] md:py-2.5"
                  >
                    <div className="flex min-w-0 gap-2">
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${item.iconClassName}`}
                        aria-hidden
                      />
                      <div className="min-w-[6.5rem] max-w-[16rem] sm:max-w-[18rem]">
                        <div className="whitespace-normal text-sm font-semibold leading-snug text-gray-900">
                          {item.title}
                        </div>
                        <p className="mt-1 whitespace-normal text-[11px] leading-snug text-gray-500">
                          {item.subtitle}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {pendingImageUrls.length > 0 &&
          onSendWithImagePrompt &&
          imgQuickChoices.length > 0 ? (
            <motion.div
              key={`img-ai-tray-${imgQuickTrayAnimKey}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6, transition: followUpExitSnap }}
              transition={{
                duration: followUpEnterSecs(0.7),
                ease: followUpSoftEase,
              }}
              className="relative z-20 mt-2 mb-4 flex w-full flex-col items-start gap-2 md:max-w-[68ch]"
            >
              {imgQuickChoices.map((item) => (
                <button
                  key={item.prompt.slice(0, 48)}
                  type="button"
                  disabled={genState !== "idle" || attachmentUploadBusy}
                  title={item.prompt}
                  onClick={() => onSendWithImagePrompt(item.prompt)}
                  className={clsx(
                    "inline-flex max-w-[min(100%,26rem)] w-fit shrink-0 items-start gap-2 rounded-2xl border border-[#e2ddd3] bg-white px-3 py-2.5",
                    "text-left text-[13px] leading-snug text-[#3d3d3d]",
                    "shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                    "hover:border-[#cfc5b8] hover:bg-[#fcfbf9] hover:shadow-sm",
                    "active:scale-[0.995] transition-[transform,background-color,border-color,box-shadow] duration-150",
                    "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#e2ddd3] disabled:hover:bg-white",
                  )}
                >
                  <ArrowUpRight
                    className="mt-px h-[15px] w-[15px] shrink-0 text-neutral-400"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="max-w-full whitespace-normal">{item.label}</span>
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <motion.div
          transition={springTransition}
          className="relative flex w-full flex-col overflow-hidden rounded-3xl border border-[#e5e5e5] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-shadow focus-within:border-gray-300 focus-within:shadow-[0_4px_20px_rgba(0,0,0,0.05)]"
        >
          {(pendingImageUrls.length > 0 ||
            attachmentUploadSkeletonCount > 0 ||
            attachmentUploadBusy) && (
            <div className="space-y-2 border-b border-gray-100 px-4 py-2.5">
              {(pendingImageUrls.length > 0 ||
                (attachmentUploadBusy && attachmentUploadSkeletonCount > 0)) && (
                <div className="flex flex-wrap gap-2">
                  {pendingImageUrls.map((url, i) => (
                    <div key={`${i}-${url.slice(0, 48)}`} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 动态 OSS URL，非导入资源 */}
                      <img
                        src={url}
                        alt=""
                        className="h-16 w-16 rounded-xl border border-gray-200 bg-gray-50 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => onRemovePendingImage(i)}
                        disabled={attachmentUploadBusy}
                        title="移除"
                        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white opacity-90 shadow transition-opacity hover:opacity-100 disabled:opacity-40"
                      >
                        <X className="h-3 w-3" strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                  {attachmentUploadBusy &&
                    attachmentUploadSkeletonCount > 0 &&
                    Array.from({ length: attachmentUploadSkeletonCount }).map((_, i) => (
                      <AttachmentUploadSkeletonTile
                        key={`sk-${i}`}
                        progress={attachmentUploadSlotProgress[i] ?? 0}
                      />
                    ))}
                  <button
                    type="button"
                    disabled={
                      attachmentDisabled ||
                      genState !== "idle" ||
                      attachmentUploadBusy ||
                      attachmentAtCap
                    }
                    onClick={() => imageFileInputRef.current?.click()}
                    title={
                      attachmentDisabled
                        ? attachmentDisabledReason ?? "当前模型不支持接收图片输入"
                        : attachmentAtCap
                          ? `最多 ${CHAT_PENDING_ATTACHMENT_MAX} 个附件`
                          : attachmentUploadBusy
                            ? "正在上传图片…"
                            : "继续添加图片"
                    }
                    aria-label="继续添加图片"
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-gray-50 disabled:hover:text-gray-500"
                  >
                    <Plus className="h-6 w-6" strokeWidth={2} />
                  </button>
                </div>
              )}
              {attachmentAtCap && !attachmentUploadBusy ? (
                <p className="text-[11px] text-gray-400">
                  已达本次发送上限（{CHAT_PENDING_ATTACHMENT_MAX} 个）
                </p>
              ) : null}
            </div>
          )}
          {hasStarted ? (
            <RoundTokensHint usage={usageHint?.usage ?? null} variant={usageHint?.variant} />
          ) : null}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={handleComposerPaste}
            placeholder={placeholder}
            title={
              attachmentDisabled
                ? undefined
                : "提示：可在输入框内直接粘贴截图或图片（与「添加图片」相同）"
            }
            className="no-scrollbar w-full max-h-[200px] min-h-[60px] overflow-y-auto py-4 px-4 bg-transparent resize-none outline-none text-[16px] text-gray-800 placeholder:text-gray-400"
            rows={1}
          />
          <input
            ref={imageFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
            multiple
            className="sr-only fixed left-[-9999px] h-px w-px opacity-0"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              onImageFilesSelected(e.target.files);
              e.target.value = "";
            }}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3 pt-1">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              {/* 深度思考按钮 */}
              <button
                type="button"
                onClick={onToggleDeepThink}
                disabled={genState !== "idle" || deepThinkDisabledByModel}
                title={
                  deepThinkDisabledByModel
                    ? "当前模型不支持深度思考"
                    : "开启后系统提示将要求模型逐步推理；若接口支持，思考过程将流式展示"
                }
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-150 disabled:opacity-50 ${
                  deepThinkEnabled
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Brain className="h-3.5 w-3.5 shrink-0" />
                深度思考
              </button>

              {/* 联网搜索按钮组 */}
              <div
                className={`inline-flex items-center rounded-full border transition-all duration-150 ${
                  genState !== "idle" || webSearchDisabledByModel
                    ? "pointer-events-none opacity-50"
                    : ""
                } ${
                  webSearchEnabled
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <button
                  type="button"
                  disabled={genState !== "idle" || webSearchDisabledByModel}
                  onClick={onToggleWebSearch}
                  title={
                    webSearchDisabledByModel
                      ? "当前模型不支持工具调用（含联网检索）"
                      : webSearchEnabled
                        ? "关闭联网搜索"
                        : "开启联网搜索"
                  }
                  className="flex items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-1 text-xs font-medium transition-colors hover:bg-black/[0.06]"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  联网搜索
                </button>
                <DropdownMenu.Root modal={false}>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      disabled={genState !== "idle" || webSearchDisabledByModel}
                      aria-label="选择联网搜索模式"
                      title={
                        webSearchDisabledByModel ? "当前模型不支持联网检索" : "选择联网搜索模式"
                      }
                      className="group flex cursor-pointer items-center rounded-r-full py-1.5 pl-0.5 pr-2 hover:bg-black/5 disabled:cursor-not-allowed"
                    >
                      <span
                        className={`flex items-center justify-center transition-transform duration-150 group-hover:scale-110 group-data-[state=open]:scale-110 ${
                          webSearchEnabled
                            ? "group-hover:text-emerald-800 group-data-[state=open]:text-emerald-800"
                            : "group-hover:text-gray-800 group-data-[state=open]:text-gray-800"
                        }`}
                        aria-hidden
                      >
                        <ChevronDown
                          className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180"
                          strokeWidth={2.25}
                        />
                      </span>
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      side="top"
                      align="end"
                      sideOffset={6}
                      className="ui-radix-floating z-[100] w-fit min-w-[10.5rem] rounded-lg border border-gray-200 bg-white py-1 shadow-md outline-none"
                    >
                      <DropdownMenu.Label className="px-3 pb-0.5 pt-1.5 text-[11px] font-medium text-gray-400">
                        联网搜索模式
                      </DropdownMenu.Label>
                      <DropdownMenu.Item
                        className="mx-1 grid cursor-pointer grid-cols-[auto_1rem] items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors data-[highlighted]:bg-gray-50"
                        onSelect={() => onSetWebSearchMode("auto")}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">自动</div>
                          <div className="text-[11px] leading-tight text-gray-400">
                            自动判断是否联网
                          </div>
                        </div>
                        {webSearchEnabled && webSearchMode === "auto" ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-gray-700" strokeWidth={2.5} />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="mx-1 grid cursor-pointer grid-cols-[auto_1rem] items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors data-[highlighted]:bg-gray-50"
                        onSelect={() => onSetWebSearchMode("force")}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">手动</div>
                          <div className="text-[11px] leading-tight text-gray-400">
                            手动控制联网状态
                          </div>
                        </div>
                        {webSearchEnabled && webSearchMode === "force" ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-gray-700" strokeWidth={2.5} />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        )}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    disabled={
                      attachmentDisabled ||
                      genState !== "idle" ||
                      attachmentUploadBusy ||
                      attachmentAtCap
                    }
                    aria-disabled={
                      attachmentDisabled ||
                      genState !== "idle" ||
                      attachmentUploadBusy ||
                      attachmentAtCap
                    }
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title={
                      attachmentDisabled
                        ? attachmentDisabledReason ?? "当前模型不支持接收图片输入"
                        : attachmentAtCap
                          ? `最多 ${CHAT_PENDING_ATTACHMENT_MAX} 个附件`
                          : attachmentUploadBusy
                            ? "正在上传图片…"
                            : "添加附件"
                    }
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="top"
                    align="start"
                    sideOffset={8}
                    className="ui-radix-floating z-[100] min-w-[11rem] rounded-lg border border-gray-200 bg-white py-0.5 shadow-lg outline-none"
                  >
                    <DropdownMenu.Label className="px-2 pb-0 pt-1 text-[11px] font-medium text-gray-400">
                      插入内容
                    </DropdownMenu.Label>
                    <DropdownMenu.Item
                      className="mx-0.5 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-900 outline-none data-[highlighted]:bg-gray-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-45"
                      disabled={
                        attachmentDisabled ||
                        genState !== "idle" ||
                        attachmentUploadBusy ||
                        attachmentAtCap
                      }
                      onSelect={(event) => {
                        event.preventDefault();
                        queueMicrotask(() => imageFileInputRef.current?.click());
                      }}
                    >
                      <ImageIcon className="h-4 w-4 shrink-0 text-gray-600" />
                      图片
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      disabled
                      className="mx-0.5 flex cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-400 outline-none data-[highlighted]:bg-transparent data-[disabled]:opacity-50"
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">本地文件</span>
                      <span className="shrink-0 text-[10px] font-medium text-gray-300">
                        敬请期待
                      </span>
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              {showAgentPicker && onSelectAgent && (
                <div className="max-w-[min(20rem,46vw)] shrink-0">
                  <Select.Root
                    disabled={genState !== "idle" || agentsLoading}
                    value={
                      selectedAgentId?.trim()
                        ? selectedAgentId.trim()
                        : SYSTEM_AGENT_SELECT_VALUE
                    }
                    onValueChange={(v) => {
                      if (v === SYSTEM_AGENT_SELECT_VALUE) onSelectAgent(null);
                      else onSelectAgent(v);
                    }}
                  >
                    <Select.Trigger className="flex w-full max-w-[min(20rem,46vw)] items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-gray-800 outline-none transition-colors hover:bg-gray-100 focus-visible:border-gray-300 disabled:opacity-45">
                      <Bot className="h-3.5 w-3.5 shrink-0 opacity-55" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-left">
                        <Select.Value placeholder={SYSTEM_AGENT_LABEL} />
                      </span>
                      <Select.Icon aria-hidden>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-55" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content
                        position="popper"
                        sideOffset={6}
                        collisionPadding={12}
                        className="ui-radix-floating z-[9999] max-h-[min(16rem,calc(100vh-6rem))] min-w-[10.5rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                      >
                        <Select.Viewport className="max-h-[min(15rem,calc(100vh-8rem))] p-1">
                          <Select.Item
                            value={SYSTEM_AGENT_SELECT_VALUE}
                            className="relative cursor-pointer select-none rounded-lg px-2.5 py-2 text-xs outline-none data-[highlighted]:bg-gray-50"
                          >
                            <Select.ItemText>{SYSTEM_AGENT_LABEL}</Select.ItemText>
                            <Select.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2">
                              <Check className="h-3.5 w-3.5" />
                            </Select.ItemIndicator>
                          </Select.Item>
                          {agents.map((a) => (
                            <Select.Item
                              key={a.id}
                              value={a.id}
                              className="relative cursor-pointer select-none rounded-lg px-2.5 py-2 text-xs outline-none data-[highlighted]:bg-gray-50"
                            >
                              <Select.ItemText className="line-clamp-2">{a.name}</Select.ItemText>
                              <Select.ItemIndicator className="absolute right-2 top-1/2 -translate-y-1/2">
                                <Check className="h-3.5 w-3.5" />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              )}

              {!modelCatalog?.providers?.length ? (
                <span
                  className="truncate rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 opacity-75"
                  title="使用服务端配置的默认对话模型（未获取到模型目录）"
                >
                  默认模型
                </span>
              ) : (
                <div className="max-w-[min(20rem,46vw)] shrink-0">
                  <Select.Root
                    disabled={genState !== "idle"}
                    value={selectCompositeValue || undefined}
                    onValueChange={(v) => {
                      const i = v.indexOf(MODEL_PICK_SEP);
                      if (i <= 0) return;
                      onSelectModel(v.slice(0, i), v.slice(i + MODEL_PICK_SEP.length));
                    }}
                  >
                    <Select.Trigger className="flex w-full max-w-[min(20rem,46vw)] items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-sm font-medium text-gray-800 outline-none transition-colors hover:bg-gray-100 focus-visible:border-gray-300 disabled:opacity-45">
                      <span
                        className="min-w-0 flex-1 truncate text-left"
                        title={
                          selectedProv && selectedRow
                            ? `${selectedProv.label} · ${selectedRow.full_label ?? selectedRow.label}`
                            : undefined
                        }
                      >
                        {selectedRow
                          ? selectedRow.full_label ?? selectedRow.label
                          : "选择模型"}
                      </span>
                      <Select.Icon aria-hidden>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-55" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content
                        position="popper"
                        sideOffset={6}
                        collisionPadding={12}
                        className="ui-radix-floating z-[9999] max-h-[min(24rem,calc(100vh-6rem))] min-w-[min(22rem,var(--radix-select-trigger-width))] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                      >
                        <Select.Viewport className="max-h-[min(22rem,calc(100vh-8rem))] p-1">
                          {modelCatalog.providers.map((prov) => (
                            <Select.Group key={prov.id}>
                              <Select.Label className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                                {prov.label}
                                {!prov.configured ? " · 未配置 KEY" : ""}
                              </Select.Label>
                              {prov.models.map((m) => (
                                <Select.Item
                                  key={`${prov.id}:${m.id}`}
                                  value={`${prov.id}${MODEL_PICK_SEP}${m.id}`}
                                  disabled={!prov.configured}
                                  className="relative cursor-pointer select-none rounded-lg p-0 text-sm outline-none data-[disabled]:cursor-not-allowed data-[highlighted]:bg-gray-50 data-[disabled]:opacity-45"
                                >
                                  <HoverCard.Root openDelay={220} closeDelay={80}>
                                    <HoverCard.Trigger asChild>
                                      <div className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-gray-900">
                                        <Select.ItemText asChild>
                                          <span className="flex-1 whitespace-normal text-left text-[13px] leading-snug line-clamp-2">
                                            {m.full_label ?? m.label}
                                          </span>
                                        </Select.ItemText>
                                        <span
                                          className={clsx(
                                            "flex shrink-0 items-center gap-0.5 text-[11px] font-medium tabular-nums text-gray-400",
                                            !prov.configured && "opacity-60",
                                          )}
                                        >
                                          <Brain
                                            className="h-3.5 w-3.5 shrink-0 opacity-55"
                                            aria-hidden
                                          />
                                          {m.speed_tag ?? "—"}
                                        </span>
                                      </div>
                                    </HoverCard.Trigger>
                                    <HoverCard.Portal>
                                      <HoverCard.Content
                                        side="right"
                                        align="start"
                                        sideOffset={12}
                                        collisionPadding={16}
                                        className="z-[10050] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-xl outline-none"
                                      >
                                        <div className="text-[15px] font-semibold leading-snug">
                                          {m.full_label ?? m.label}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-gray-500">
                                          <span>{prov.label}</span>
                                          <span className="text-gray-300">·</span>
                                          <code className="rounded bg-gray-100 px-1 py-px font-mono text-[10px] text-gray-600">
                                            {m.id}
                                          </code>
                                        </div>
                                        {!prov.configured ? (
                                          <p className="mt-3 rounded-lg bg-amber-50 px-2 py-1.5 text-xs leading-snug text-amber-950">
                                            尚未配置 API Key：请在服务端{" "}
                                            <span className="font-mono">.env</span>{" "}
                                            填写对应 Key 后启用。
                                          </p>
                                        ) : null}
                                        <p className="mt-3 text-xs leading-relaxed text-gray-600">
                                          {m.description}
                                        </p>
                                        {prov.id === "deepseek" && prov.configured ? (
                                          <p className="mt-2 text-[11px] leading-snug text-gray-500">
                                            官方支持思考模式与工具调用并存；多轮请求需完整回传每步{" "}
                                            <span className="font-mono">reasoning_content</span>
                                            ，本项目已自动处理。
                                          </p>
                                        ) : null}
                                        {m.context_window_hint ? (
                                          <p className="mt-3 border-t border-gray-100 pt-2 text-[11px] italic leading-snug text-gray-500">
                                            {m.context_window_hint}
                                          </p>
                                        ) : null}
                                      </HoverCard.Content>
                                    </HoverCard.Portal>
                                  </HoverCard.Root>
                                </Select.Item>
                              ))}
                            </Select.Group>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              )}

              <ChatSendControls
                genState={genState}
                hasSendableContent={hasSendableContent}
                attachmentUploadBusy={attachmentUploadBusy}
                onSend={onSend}
                onStop={onStop}
              />
            </div>
          </div>
        </motion.div>

        {/* 免责声明 */}
        <AnimatePresence>
          <motion.div
            key="disclaimer"
            initial={
              chatSurfacePhase === "authPending" || chatSurfacePhase === "hydrating"
                ? false
                : { opacity: 0, y: 6 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center mt-3 text-xs text-gray-400 font-medium px-2"
          >
            AI 可能会产生误导性信息，请结合实际情况判断。
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
