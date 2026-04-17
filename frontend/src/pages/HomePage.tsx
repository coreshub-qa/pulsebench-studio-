import { motion } from "framer-motion";
import { ArrowRight, FlaskConical, ScanSearch, SlidersHorizontal, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const cards = [
  {
    title: "一键体检",
    path: "/quick-check",
    icon: ScanSearch,
    kicker: "最快摸底",
    description: "只填模型连接信息，几分钟内确认服务是否健康。",
    audience: "首次接入与快速验活",
  },
  {
    title: "场景模板",
    path: "/templates",
    icon: FlaskConical,
    kicker: "标准验证",
    description: "按目标选择模板，自动展开矩阵后批量运行。",
    audience: "正式验证与横向对比",
  },
  {
    title: "Agent 模式",
    path: "/agent",
    icon: Sparkles,
    kicker: "智能规划",
    description: "输入已知条件，让 Agent 先生成一份可审阅的测试策略草案。",
    audience: "不确定该怎么开局的操作者",
  },
  {
    title: "高级自定义",
    path: "/custom",
    icon: SlidersHorizontal,
    kicker: "精细控制",
    description: "保留完整参数控制权，适合非标准实验与深度调参。",
    audience: "已知测试目标的操作者",
  },
];

export function HomePage() {
  return (
    <div className="space-y-6">
      {/* Hero: single primary action */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel-surface rounded-[28px] p-6 md:p-8"
      >
        <div className="eyebrow">开始测试</div>
        <h1 className="mt-4 max-w-2xl font-display text-[36px] leading-[1.08] text-white md:text-[48px]">
          推理实验台
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-8 text-signal-fog/65">
          选择一条路径，开始你的推理服务性能测试。
        </p>

        <Link
          to="/quick-check"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-signal-copper/35 bg-signal-copper/12 px-6 py-3.5 text-sm font-medium text-signal-copper transition hover:bg-signal-copper/20"
        >
          快速开始：一键体检
          <ArrowRight className="h-4 w-4" />
        </Link>

        <div className="mt-3 text-xs text-signal-fog/45">
          不确定选哪个？一键体检是最快的起步方式。也可以从下方选择其他路径。
        </div>
      </motion.div>

      {/* Three entry cards — streamlined */}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        {cards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06 }}
          >
            <Link
              to={card.path}
              className="group panel-surface flex h-full flex-col rounded-[24px] p-5 transition hover:border-signal-copper/20"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-black/14 text-signal-copper">
                  <card.icon className="h-4 w-4" />
                </div>
                <span className="font-mono text-[10px] tracking-[0.22em] text-signal-copper/75">{card.kicker}</span>
              </div>

              <h2 className="mt-4 font-display text-[24px] leading-none text-white">{card.title}</h2>
              <p className="mt-3 text-sm leading-7 text-signal-fog/65">{card.description}</p>

              <div className="mt-auto pt-4 text-xs text-signal-fog/50">{card.audience}</div>

              <div className="mt-4 inline-flex items-center gap-1.5 text-sm text-signal-copper/70 transition group-hover:text-signal-copper">
                进入
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Compact decision helper — collapsed from the old verbose section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-[22px] border border-white/6 bg-white/[0.02] px-5 py-4"
      >
        <div className="eyebrow mb-3">不确定选哪个？</div>
        <div className="grid gap-3 text-sm lg:grid-cols-4">
          <div className="flex items-start gap-2 text-signal-fog/60">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-copper/60" />
            <span>只想知道服务能不能用 → <span className="text-white/80">一键体检</span></span>
          </div>
          <div className="flex items-start gap-2 text-signal-fog/60">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-copper/60" />
            <span>目标明确但不想手配矩阵 → <span className="text-white/80">Agent 模式</span></span>
          </div>
          <div className="flex items-start gap-2 text-signal-fog/60">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-copper/60" />
            <span>有明确目标要批量跑 → <span className="text-white/80">场景模板</span></span>
          </div>
          <div className="flex items-start gap-2 text-signal-fog/60">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-copper/60" />
            <span>要严格控制参数复现实验 → <span className="text-white/80">高级自定义</span></span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
