# UX 改进问题追踪

> 来源：2026-05-12 产品分析 | 更新：2026-05-12

---

## P0 — 已修复（Bug，直接影响用户）

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| 1 | `CFLTChat` 硬编码 `uiLang = 'Chinese'`，所有非中文用户看到中文标签 | `components/CFLTChat.tsx:186` | ✅ 已修复 |
| 2 | Roleplay `handleSend` 不处理 401（API key 错误），静默显示"Coach error" | `components/CFLTChat.tsx:183` | ✅ 已修复 |
| 3 | 对话历史截断（4096字节）无任何提示，消息无声消失 | `components/CFLTChat.tsx` | ✅ 已修复（UI 警告） |
| 4 | Roleplay 无重置对话按钮，无法开始新话题 | `components/CFLTChat.tsx` | ✅ 已修复 |

## P1 — 已修复（体验改进）

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| 5 | Stats 空状态只有一句话，无行动引导 | `components/ProgressDashboard.tsx` | ✅ 已修复 |
| 6 | Stats 学习曲线数据 < 3 条时毫无意义（折线图只有1-2个点）| `components/ProgressDashboard.tsx` | ✅ 已修复 |
| 7 | Transform 完成后无 CTA 引导进入 Roleplay 练习 | `app/page.tsx` | ✅ 已修复 |
| 8 | 新用户首次打开 Transform Tab 无任何引导 | `app/page.tsx` | ✅ 已修复（placeholder示例） |
| 9 | 行业选项仅 4 个，无法覆盖多数职业（法律/教育/设计等）| `app/page.tsx` | ✅ 已修复（可输入 combobox） |
| 10 | 课程生成（20-30秒）仅显示 spinner，无进度提示 | `app/page.tsx` | ✅ 已修复（步骤提示） |

## P1 — 已完成

| # | 问题 | 文件 | 状态 |
|---|------|------|------|
| T1 | **Roleplay CFLT 构建模式**：4 个槽位引导结构后合并发送 | `components/CFLTChat.tsx` | ✅ 已实现（Build 模式切换按钮）|
| T2 | **Transform 遮盖复述训练**：看完后遮住答案，用户输入对比 | `app/page.tsx` | ✅ 已实现（Test Yourself 按钮）|
| T3 | **Puzzle 完成状态持久化**：刷新后丢失 | `app/api/progress/puzzles/route.ts` + `app/page.tsx` | ✅ 已实现（加载课程时从 PouchDB 恢复）|

## P2 — 待实现

| # | 问题 | 所需逻辑 | 优先级 |
|---|------|---------|--------|
| T4 | **词汇到期直达复习**：Stats 里"X 个词到期"要能直接进入复习模式 | 需要新建词汇复习 Tab 或 Roleplay 词汇模式 | P2 |
| T5 | **Transform → 一键加入 Course**：把当前变换结果作为 Course 内容 | 后端：把 transform 结果包装成 courseware manifest | P2 |
| T6 | **对话历史汇总**：超过 4096 字节时 LLM 摘要旧消息而非截断 | API 路由：历史过长时先做摘要 | P2 |
| T7 | **Course 生成实时进度**：SSE 流式返回 lesson 生成进度 | 后端：把 orchestrator 改为流式 | P2 |
| T8 | **Phonetic Bridge 结构化**：Pinyin → IPA 映射表 + 交互 UI | 新模块：拼音-IPA 对照数据 + 组件 | P2 |

## 长期（P2）

| # | 问题 |
|---|------|
| L1 | "Child (Age 8)" 选项与 PRD Out-of-scope 矛盾，决策：保留还是删除 |
| L2 | 跨 Tab 数据关联展示（Transform 学到的词在 Roleplay 使用了多少次）|
| L3 | 学习漏斗引导（Tab 之间缺乏推荐流，用户不知道 Transform → Course → Roleplay 的顺序）|
