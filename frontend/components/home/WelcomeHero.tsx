/**
 * @fileoverview 空会话欢迎区：随机标题与打字机轮播句子（客户端挂载后启动，避免 hydration 不一致）。
 */
"use client";

import { useEffect, useState } from "react";
import { Sun } from "lucide-react";
import clsx from "clsx";

type WelcomeVariant = {
  title: string;
  /** 与标题配套的句子（5～7 条）；按顺序打字 → 停留 → 淡出 → 下一句 */
  sentences: string[];
};

const WELCOME_VARIANTS: WelcomeVariant[] = [
  {
    title: "需要中医咨询吗？",
    sentences: [
      "你可以像线下初诊那样，从「哪里不舒服、持续多久、有没有诱因」一条条往下捋。",
      "也可以不急着重症，只说换季失眠、咽干口苦、胃里泛酸这一类日常小困扰——都能慢慢聊到合适的话题。",
      "若一时不知从何开口，不妨试试先点快捷卡片：随机推荐的话题常常能接住你的好奇。",
      "我们会尽量少用生硬术语；遇到必须用的概念，会用白话帮你接住前后文。",
      "请把这里当作信息与思路的集散地：你可以反复改述、追问、对比不同说法。",
      "但也要记住：线上的回答只适合科普与一般性养生讨论。",
      "涉及用药、方剂加减或明确诊断与处置时，请以执业医师当面诊察与检查结果为准——这一点怎么强调都不过分。",
    ],
  },
  {
    title: "今天想从哪里聊起？",
    sentences: [
      "若脑袋里一团乱麻，不妨试试从一句白话开场：我最近哪里不对劲、从什么时候开始的？",
      "时间轴很有用：同一天里什么时候更难受？这一周比上一周更重还是更轻？这类细节能显著压缩「猜谜」的成本。",
      "寒热也很关键：怕冷喜暖还是怕热口干，夜里重还是白日重——常常能把讨论带向不同方向。",
      "你还可以顺便说说饮食、作息、工作与情绪压力——它们往往不是「附加题」，反而是线索。",
      "信息量越少，我们越容易只能谈原则；多给一句具象描述，就多一分讨论的深度。",
      "若你其实是在替家人问：也可以说明年龄、既往习惯与正在用的药——当然注意脱敏隐私。",
      "最后仍要提醒的是：这些内容仅供学习与自我觉察参考，不可替代线下就诊处方与医嘱。",
    ],
  },
  {
    title: "辨体质 · 食疗 · 时令",
    sentences: [
      "体质辨析并不是贴标签那么简单：手脚冰凉与咽干口苦可能牵涉不同层面的倾向——我们可以先聊「体感谱系」而不是急着下结论。",
      "二十四节气与地域气候，也会让「此时宜什么、不宜什么」呈现差异：南方湿热与北部干冷，谈资并不相同。",
      "聊到食疗药膳时，更适合先谈原则与大类：性味偏温还是偏清、是否滋腻碍胃、是否与你当前脾胃状态相配。",
      "具体食材能不能长期吃、吃多少、与药物是否相冲——仍需要结合舌脉与化验检查，由医生个体化判断。",
      "你也可以从「最近吃了什么、身体有什么反馈」这种生活细节切入，比空泛问「我是什么体质」更容易聊出东西。",
      "若你正在服药或慢病随访：任何饮食调整都建议先与主治团队确认，不要自行替代治疗。",
    ],
  },
  {
    title: "慢一点，给身体一点描述",
    sentences: [
      "中医讲望闻问切；在线聊天至少可以把「问」的一部分做细：部位、性质、诱发与缓解因素，都值得慢慢写清。",
      "疼痛或不适最好区分：刺痛、胀痛、酸痛、空痛——词不同，讨论路径往往也不同。",
      "还要区分急性与缠绵：一两天突然冒出来，与迁延数周此起彼伏，含义并不一样。",
      "情绪和睡眠从来不是旁支：思虑多、易怒、多梦易醒，有时正是身体在主诉之外默默递出的第二张纸条。",
      "你不用一次写满分作文：可以分几条消息补细节，我们也很欢迎「想到再补」。",
      "我们不会替线下医生封口下诊断，也不能替代检查；但能把你的描述整理得更像一句「会问医生的好问题」。",
    ],
  },
  {
    title: "从经典到日常",
    sentences: [
      "你可以从最玄乎的经典条文问起，也可以从六味地黄丸这一类家常药切入——两者之间并没有高下，只是切入点不同。",
      "想了解一句话在《黄帝内经》语境里的大概指向，我们常会用「字面—意象—在临床上常被借用来比喻什么」三层来讲。",
      "涉及常用中成药时，更适合谈：传统功效取向、常见误用场景、以及为什么「同名药」也不能互相替代。",
      "若你想看模型如何一步步推理，可以打开「深度思考」：适合慢读、愿意看中间过程的时候。",
      "若你想对照较新的公开资料或指南类信息，再开「联网搜索」会更省力——但也要记得核验来源与更新时间。",
      "我们更擅长帮你建立概念坐标：哪里是共识、哪里仍有争议、你下一步最值得向医生确认的清单是什么。",
      "我们不会给出个体处方或剂量调整指令；那是在诊室里、看完了你这个人之后才能完成的工作。",
    ],
  },
  {
    title: "养生不是进补堆砌",
    sentences: [
      "虚火、痰湿、气滞、血瘀……在中医话语里并不少见；但若把标签当结论，很容易出现「越看越像、越补越乱」。",
      "更稳妥的路径是先粗分寒热虚实的大方向：最近在怕冷却仍口干，还是畏寒喜暖更明显？这层判断常决定补还是清的方向。",
      "进补也不是堆名贵药材：脾胃虚弱时，清的、腻的都可能「吃不下」——先谈脾胃承托能力往往更现实。",
      "作息与情绪会悄悄改写体质表现：熬夜后舌干口苦，与长期焦虑后的胸闷嗳气，讨论重点并不相同。",
      "适合你此刻生活方式的微调，可能比一味追「大补」更有意义：可走可停、可轻可重的渐进式试错。",
      "当出现持续消瘦、失血、顽固性疼痛、发热不退等红旗症状时：请优先就医排查器质性问题，别把聊天当成延误理由。",
    ],
  },
  {
    title: "给身心一个小对话",
    sentences: [
      "有时候身体并不是在「报错」，而是在求你慢一点：肩颈僵成一块、胃里堵得慌，都可能是节律被打乱后的讯号。",
      "睡眠与胃口也很会说谎又会说真话：翻来覆去与多梦，未必只是「睡不好」三个字就能概括——值得把一周的模式写出来。",
      "从一句很轻的「我最近……」开始也很好：你越诚实，越容易得到对你此刻状态更贴切的类比与解释路径。",
      "快捷卡片与随机话题并不是敷衍；它们只是把话题入口铺得很宽——点一下，也许就碰到你真正想说的那一类。",
      "在这里，我们会尽量把语气放软、把句子缩短、把术语掰开；你不必像写病历一样严肃。",
      "但请记得：这里仍是科普与自我理解的窗口，不是急诊室，也不是能替代处方的线上诊室。",
      "你随时可以推翻上一句、换角度重来——对话本来就可以像走路一样，绕一小圈再回到正路。",
    ],
  },
  {
    title: "你好奇的中医话题",
    sentences: [
      "舌象、脉象、经络走向、药食同源……任何一块都可以拆成：它观察什么、历史上怎么被用、今天讨论时常踩的坑。",
      "我们宁可把「不确定」说在前面：仅凭文字与图片，很多判断只能停留在科普层面，这是严谨而不是敷衍。",
      "聊脉象与舌象时，更适合谈「通常被用来提示什么倾向」以及「为什么仍要四诊合参」——而不是替你把脉。",
      "药食同名亦不必神化或妖魔化：性味、体质与季节、与正在用的西药之间，都有需要专业核对的地方。",
      "你也可以把这次聊天当作预演：把最想问医生的三句话先写顺了，现场就不容易漏问。",
      "若你此刻症状明显、进展快，或已经影响日常安全：请把线下就医放在聊天之前——这是对自己最负责的选择。",
    ],
  },
];

/** SSR 与首次客户端渲染必须一致，避免 hydration mismatch */
const SSR_TITLE_FALLBACK = "需要中医咨询吗？";

/** 一句完整打出后保持可读的时间，再淡出（原 2.4s + 0.8s） */
const READ_HOLD_AFTER_TYPING_MS = 3200;

/** 淡出动画时长（偏快） */
const FADE_OUT_MS = 280;

/** 淡出结束 → 下一句开始打字之间的短留白 */
const GAP_BEFORE_NEXT_TYPING_MS = 420;

/** 每句开始打字前的小延迟 */
const SENTENCE_START_DELAY_MS = 380;

/** 随机选取一组欢迎文案变体。 */
function pickRandomVariant(): WelcomeVariant {
  return WELCOME_VARIANTS[Math.floor(Math.random() * WELCOME_VARIANTS.length)]!;
}

/** 按标点与换行调节打字间隔，模拟自然阅读节奏。 */
function charDelayMs(ch: string, prev: string): number {
  if (ch === "\n") return 180;
  if (/[，。；：？！、]/.test(ch)) return 140;
  if (/[……]/.test(ch)) return 220;
  if (/[。.]/.test(prev) && ch !== "\n") return 80;
  return 26 + Math.round(Math.random() * 14);
}

type LinePhase = "typing" | "reading" | "fading";

/** 新对话空态欢迎 Hero：标题固定、副句打字 → 停留 → 淡出循环。 */
export function WelcomeHero() {
  const [variant, setVariant] = useState<WelcomeVariant | null>(null);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [linePhase, setLinePhase] = useState<LinePhase>("typing");

  useEffect(() => {
    const t = window.setTimeout(() => {
      setVariant(pickRandomVariant());
      setSentenceIndex(0);
      setTyped("");
      setLinePhase("typing");
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!variant || linePhase !== "typing") return;
    const full =
      variant.sentences.length === 0
        ? ""
        : (variant.sentences[sentenceIndex % variant.sentences.length] ?? "");
    if (!full) return;

    let i = 0;
    const ctrl = { cancelled: false as boolean, tid: undefined as number | undefined };

    const clearTimer = () => {
      if (ctrl.tid !== undefined) window.clearTimeout(ctrl.tid);
      ctrl.tid = undefined;
    };

    const schedule = (ms: number, fn: () => void) => {
      clearTimer();
      ctrl.tid = window.setTimeout(fn, ms);
    };

    const runStep = () => {
      if (ctrl.cancelled) return;
      if (i >= full.length) {
        setLinePhase("reading");
        return;
      }
      i += 1;
      setTyped(full.slice(0, i));
      const prev = i >= 2 ? (full[i - 2] ?? "") : "";
      const ch = full[i - 1] ?? "";
      schedule(charDelayMs(ch, prev), runStep);
    };

    const kickoff = () => {
      if (ctrl.cancelled) return;
      setTyped("");
      schedule(SENTENCE_START_DELAY_MS, runStep);
    };

    schedule(0, kickoff);

    return () => {
      ctrl.cancelled = true;
      clearTimer();
    };
  }, [variant, linePhase, sentenceIndex]);

  useEffect(() => {
    if (!variant || linePhase !== "reading") return;
    const t = window.setTimeout(() => {
      setLinePhase("fading");
    }, READ_HOLD_AFTER_TYPING_MS);
    return () => window.clearTimeout(t);
  }, [linePhase, variant]);

  useEffect(() => {
    if (!variant || linePhase !== "fading") return;
    const n = variant.sentences.length;
    const t = window.setTimeout(() => {
      setTyped("");
      setSentenceIndex((prev) => (n <= 1 ? 0 : (prev + 1) % n));
      setLinePhase("typing");
    }, FADE_OUT_MS + GAP_BEFORE_NEXT_TYPING_MS);
    return () => window.clearTimeout(t);
  }, [linePhase, variant]);

  const showCaret = variant !== null && linePhase === "typing";
  const title = variant?.title ?? SSR_TITLE_FALLBACK;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-4 pt-6 text-center md:pt-8">
      <div className="flex flex-wrap items-center justify-center gap-2.5 font-serif text-2xl text-[#1a1a1a] md:gap-3 md:text-3xl">
        <Sun className="h-7 w-7 shrink-0 text-orange-500 md:h-8 md:w-8" aria-hidden />
        <h1 className="text-balance">{title}</h1>
      </div>
      <p
        className="mx-auto mt-4 flex min-h-[7rem] w-full max-w-lg flex-col items-center text-center text-pretty text-sm leading-relaxed text-gray-500 md:min-h-[7.25rem]"
        aria-live="polite"
      >
        <span
          className={clsx(
            "inline-block max-w-full whitespace-pre-wrap text-center transition-opacity ease-out [text-wrap:pretty]",
            linePhase === "fading" ? "opacity-0" : "opacity-100",
          )}
          style={{
            transitionDuration: `${linePhase === "fading" ? FADE_OUT_MS : 260}ms`,
          }}
        >
          {typed}
          {showCaret && (
            <span
              className="ml-0.5 inline-block h-4 w-px translate-y-0.5 animate-pulse bg-orange-500/90 align-middle"
              aria-hidden
            />
          )}
        </span>
      </p>
    </div>
  );
}
