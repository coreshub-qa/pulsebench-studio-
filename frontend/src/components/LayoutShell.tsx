import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Activity, ChevronRight, FileSearch, FlaskConical, History, Radar, SlidersHorizontal, Sparkles } from "lucide-react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";

const navItems = [
  {
    to: "/",
    label: "工作台首页",
    desc: "先判断该走哪条测试路径",
    action: "选择模式",
    step: "00",
    icon: FlaskConical,
  },
  {
    to: "/quick-check",
    label: "一键体检",
    desc: "最短路径做健康摸底",
    action: "填写连接信息",
    step: "01",
    icon: Radar,
  },
  {
    to: "/templates",
    label: "场景模板",
    desc: "按目标展开标准矩阵",
    action: "确认模板与矩阵",
    step: "02",
    icon: Activity,
  },
  {
    to: "/agent",
    label: "Agent 模式",
    desc: "根据目标与环境生成策略草案",
    action: "审阅并执行",
    step: "03",
    icon: Sparkles,
  },
  {
    to: "/custom",
    label: "高级自定义",
    desc: "逐项控制连接、负载与约束",
    action: "完成参数编排",
    step: "04",
    icon: SlidersHorizontal,
  },
  {
    to: "/history",
    label: "历史报告",
    desc: "回看单次与批次结果",
    action: "复盘与复跑",
    step: "05",
    icon: History,
  },
];

function resolveMeta(pathname: string) {
  if (pathname === "/") {
    return {
      kicker: "Studio Home",
      title: "推理实验台",
      summary: "选择模式，开始测试。",
      stage: "选择模式",
    };
  }

  if (pathname.startsWith("/quick-check")) {
    return {
      kicker: "Quick Check",
      title: "一键体检",
      summary: "快速确认服务可用性。",
      stage: "基础配置",
    };
  }

  if (pathname.startsWith("/templates")) {
    return {
      kicker: "Scenario Templates",
      title: "场景模板",
      summary: "用模板生成可复用矩阵。",
      stage: "模板编排",
    };
  }

  if (pathname.startsWith("/agent")) {
    return {
      kicker: "Agent Strategy",
      title: "Agent 模式",
      summary: "输入目标与环境，让系统先生成一份可执行策略。",
      stage: "策略规划",
    };
  }

  if (pathname.startsWith("/custom")) {
    return {
      kicker: "Custom Builder",
      title: "高级自定义",
      summary: "精确描述连接、负载与边界。",
      stage: "精细配置",
    };
  }

  if (pathname.startsWith("/live")) {
    return {
      kicker: "Live Run",
      title: "实时运行",
      summary: "查看当前任务进度。",
      stage: "运行中",
    };
  }

  if (pathname.startsWith("/batch/")) {
    return {
      kicker: "Batch Live",
      title: "批次运行",
      summary: "追踪批次状态与进度。",
      stage: "批次运行",
    };
  }

  if (pathname.startsWith("/batch-report")) {
    return {
      kicker: "Batch Report",
      title: "批次报告",
      summary: "查看矩阵结论与细节。",
      stage: "结果解读",
    };
  }

  if (pathname.startsWith("/report")) {
    return {
      kicker: "Run Report",
      title: "单次报告",
      summary: "查看单次结论与指标。",
      stage: "结果解读",
    };
  }

  return {
    kicker: "Archive",
    title: "历史记录",
    summary: "检索与复跑实验。",
    stage: "历史检索",
  };
}

export function LayoutShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const meta = resolveMeta(location.pathname);
  const isHome = location.pathname === "/";

  return (
    <div className="relative min-h-screen overflow-hidden text-signal-fog">
      <div className="relative mx-auto grid min-h-screen max-w-[1540px] gap-5 px-4 py-4 md:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:py-6">
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          className="panel-surface flex flex-col rounded-[28px] p-4 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]"
        >
          <Link to="/" className="rounded-[22px] border border-white/8 bg-black/10 px-4 py-4 transition hover:border-white/16">
            <div className="inline-flex items-center gap-2 rounded-full border border-signal-copper/20 bg-signal-copper/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.22em] text-signal-copper">
              <FileSearch className="h-3 w-3" />
              PulseBench Studio
            </div>
            <div className="mt-3 font-display text-[26px] leading-none text-white">推理实验台</div>
          </Link>

          <div className="mt-5 space-y-1.5">
            <div className="eyebrow px-1 mb-1">Workflow</div>
            {navItems.map(({ to, label, desc, step, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-2.5 rounded-[18px] border px-3 py-2.5 transition",
                    isActive
                      ? "border-signal-copper/28 bg-white/[0.045] text-white"
                      : "border-transparent bg-transparent text-signal-fog/72 hover:border-white/10 hover:bg-white/[0.03] hover:text-white",
                  )
                }
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-black/15 text-signal-copper">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[10px] tracking-[0.2em] text-signal-copper/80">{step}</span>
                    <span className="text-[13px] font-medium">{label}</span>
                  </div>
                  <div className="text-[11px] leading-5 text-signal-fog/50">{desc}</div>
                </div>
                <ChevronRight className="h-3.5 w-3.5 opacity-30 transition group-hover:translate-x-0.5 group-hover:opacity-60" />
              </NavLink>
            ))}
          </div>

        </motion.aside>

        <main className="min-w-0 pb-8">
          {/* Compact context bar — compressed from the old full-bleed header */}
          {!isHome ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-center gap-4 rounded-[20px] border border-white/6 bg-white/[0.025] px-5 py-3"
            >
              <div className="eyebrow shrink-0">{meta.kicker}</div>
              <div className="h-4 w-px bg-white/10" />
              <h1 className="font-display text-xl text-white">{meta.title}</h1>
              <span className="text-sm text-signal-fog/55">{meta.summary}</span>
              <div className="ml-auto rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-signal-fog/55">
                {meta.stage}
              </div>
            </motion.div>
          ) : null}

          {children}
        </main>
      </div>
    </div>
  );
}
