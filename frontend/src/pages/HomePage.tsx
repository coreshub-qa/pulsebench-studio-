import { motion } from "framer-motion";
import { ArrowRight, Clock, FlaskConical, ScanSearch, SlidersHorizontal, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { HistoryItem } from "../lib/types";
import { formatDate, getStatusTone } from "../lib/utils";

const modeCards = [
  {
    title: "一键体检",
    path: "/quick-check",
    icon: ScanSearch,
    kicker: "最快摸底",
    description: "只填模型连接信息，几分钟内确认服务是否健康。",
    when: "首次接入",
  },
  {
    title: "场景模板",
    path: "/templates",
    icon: FlaskConical,
    kicker: "标准验证",
    description: "按目标选择模板，自动展开矩阵后批量运行。",
    when: "正式验证",
  },
  {
    title: "高级自定义",
    path: "/custom",
    icon: SlidersHorizontal,
    kicker: "精细控制",
    description: "保留完整参数控制权，适合非标准实验与深度调参。",
    when: "精确复现",
  },
];

export function HomePage() {
  const [recentRuns, setRecentRuns] = useState<HistoryItem[]>([]);

  useEffect(() => {
    api.getHistory().then((items) => setRecentRuns(items.slice(0, 3))).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel-surface relative overflow-hidden rounded-[32px] p-6 md:p-8"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_8%_20%,rgba(110,203,184,0.1),transparent_30%),radial-gradient(circle_at_92%_30%,rgba(200,154,91,0.1),transparent_32%)]" />
        <div className="relative">
          <div className="eyebrow">PulseBench Studio</div>
          <h1 className="mt-4 max-w-2xl font-display text-[36px] leading-[1.08] text-white md:text-[48px]">
            你的推理服务，表现如何？
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-8 text-signal-fog/65">
            选择一条路径，开始你的推理服务性能测试。不确定从哪开始？试试 Agent 模式。
          </p>
        </div>
      </motion.div>

      {/* Recommended: Agent mode */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Link
          to="/agent"
          className="group relative block overflow-hidden rounded-[28px] border border-signal-copper/25 bg-[linear-gradient(135deg,rgba(200,154,91,0.08),rgba(110,203,184,0.04))] p-6 transition hover:border-signal-copper/40"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(200,154,91,0.12),transparent_40%)]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-signal-copper/20 bg-signal-copper/10 px-3 py-1 font-mono text-[10px] tracking-[0.22em] text-signal-copper">
                <Sparkles className="h-3 w-3" />
                推荐起步
              </div>
              <h2 className="mt-3 font-display text-[28px] leading-none text-white">Agent 模式</h2>
              <p className="mt-2 max-w-md text-sm leading-7 text-signal-fog/65">
                不确定从哪开始？输入已知条件，让 Agent 帮你规划首轮实验策略。
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-[18px] border border-signal-copper/35 bg-signal-copper/10 px-5 py-3 text-sm font-medium text-signal-copper transition group-hover:bg-signal-copper/16">
              开始规划
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Mode grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {modeCards.map((card, index) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.05 }}
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

              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="text-xs text-signal-fog/45">{card.when}</span>
                <span className="inline-flex items-center gap-1.5 text-sm text-signal-copper/70 transition group-hover:text-signal-copper">
                  进入
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Recent activity */}
      {recentRuns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-[22px] border border-white/6 bg-white/[0.02] px-5 py-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-signal-fog/40" />
              <span className="eyebrow">最近测试</span>
            </div>
            <Link to="/history" className="text-xs text-signal-fog/45 transition hover:text-signal-copper">
              查看全部 →
            </Link>
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            {recentRuns.map((run) => {
              const tone = getStatusTone(run.status);
              return (
                <Link
                  key={run.runId}
                  to={run.status === "running" ? `/live/${run.runId}` : `/report/${run.runId}`}
                  className="flex items-center justify-between rounded-[14px] border border-white/6 bg-white/[0.02] px-3 py-2 transition hover:border-white/12"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white">{run.title || run.model}</div>
                    <div className="mt-0.5 text-[11px] text-signal-fog/40">{formatDate(run.createdAt)}</div>
                  </div>
                  <span className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] ${tone}`}>
                    {run.status}
                  </span>
                </Link>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Decision helper */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
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
