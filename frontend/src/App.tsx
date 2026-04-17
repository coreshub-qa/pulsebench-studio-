import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { LayoutShell } from "./components/LayoutShell";
import { HomePage } from "./pages/HomePage";
import { AgentModePage } from "./pages/AgentModePage";
import { LaunchPage } from "./pages/LaunchPage";
import { TemplateModePage } from "./pages/TemplateModePage";

const LiveRunPage = lazy(() => import("./pages/LiveRunPage").then((module) => ({ default: module.LiveRunPage })));
const ReportPage = lazy(() => import("./pages/ReportPage").then((module) => ({ default: module.ReportPage })));
const HistoryPage = lazy(() => import("./pages/HistoryPage").then((module) => ({ default: module.HistoryPage })));
const BatchLivePage = lazy(() => import("./pages/BatchLivePage").then((module) => ({ default: module.BatchLivePage })));
const BatchReportPage = lazy(() => import("./pages/BatchReportPage").then((module) => ({ default: module.BatchReportPage })));

export default function App() {
  return (
    <LayoutShell>
      <Suspense fallback={<div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-signal-fog/70">模块加载中...</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/agent" element={<AgentModePage />} />
          <Route path="/quick-check" element={<TemplateModePage mode="quick_check" />} />
          <Route path="/templates" element={<TemplateModePage mode="template" />} />
          <Route path="/templates/:templateId" element={<TemplateModePage mode="template" />} />
          <Route path="/custom" element={<LaunchPage />} />
          <Route path="/live/:runId" element={<LiveRunPage />} />
          <Route path="/report/:runId" element={<ReportPage />} />
          <Route path="/batch/:batchId" element={<BatchLivePage />} />
          <Route path="/batch-report/:batchId" element={<BatchReportPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </Suspense>
    </LayoutShell>
  );
}
