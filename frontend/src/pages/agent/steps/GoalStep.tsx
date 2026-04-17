import { SectionCard } from "../../../components/SectionCard";
import { SelectCards } from "../../../components/form/SelectCards";
import type { AgentGoal } from "../../../lib/types";

const goalCards = [
  {
    value: "health_check" as AgentGoal,
    title: "首轮验活",
    kicker: "Fast Pass",
    description: "先确认服务是否健康，避免一开始就把实验面铺太大。",
  },
  {
    value: "interactive_experience" as AgentGoal,
    title: "交互体验",
    kicker: "Human Feel",
    description: "优先关注首 Token、平均延迟和日常问答的等待感。",
  },
  {
    value: "balanced_throughput" as AgentGoal,
    title: "均衡吞吐",
    kicker: "Production Fit",
    description: "围绕典型生产负载寻找吞吐和延迟的平衡点。",
  },
  {
    value: "long_context" as AgentGoal,
    title: "长上下文",
    kicker: "Context Edge",
    description: "验证长输入条件下的 TTFT、稳定性和接近上限行为。",
  },
  {
    value: "capacity_limit" as AgentGoal,
    title: "容量压测",
    kicker: "Stress Curve",
    description: "寻找最大稳定并发区间，明确系统的容量边界。",
  },
];

export function GoalStep({
  goal,
  onChange,
}: {
  goal: AgentGoal;
  onChange: (goal: AgentGoal) => void;
}) {
  return (
    <SectionCard title="测试目标" kicker="Step 01">
      <SelectCards options={goalCards} value={goal} onChange={onChange} />
    </SectionCard>
  );
}
