# DSH Notebook 真实联调验收

日期：2026-11-17，Asia/Singapore。范围：复用桌面 DSH 已接入的搜索、网页读取和模型，完成自动建库、来源保存、学习导读和资料问答，并修复联调中实际发现的问题。

## 结论与打开方式

自动研究与导读均已达到 `done`；当前笔记本有 3 个真实、启用、可读取的 Python 3.14 官方来源。资料问答已调用本地笔记本检索并给出来源引用；点击引用可打开已保存正文。首次简短回答遗漏的异常规则特例，已经通过进一步读取来源和追问补齐，原始回答与纠正记录均保留。

在 DeepSeek Harness 侧栏打开「笔记本」，进入「会话」选择 **Python asyncio · 真实验收**。目标笔记本为 **Python asyncio 3.14 · 结构化并发学习笔记**，研究卡可打开学习指南。历史失败记录和排查用产物仍保留；本报告以下面的精确 ID 区分最终成果。

| 对象 | ID / 环境 |
| --- | --- |
| 桌面宿主 | `/Applications/DeepSeek Harness.app`，相关 DSH 包 `0.2.2-rc.3` |
| Profile | `/Users/skylake/.dsh/profiles/desktop` |
| 数据库 | `/Users/skylake/.dsh/profiles/desktop/plugin-data/dsh-notebook/library.sqlite` |
| 插件代码 | 当前工作区 `/Users/skylake/Work/Projects/dsh-notebook`，由安装插件链接加载 |
| 模型 | DeepSeek-V4.1-Flash；路由 `deepseek-official / deepseek-flash` |
| 搜索、读取提供方 | 已配置的 `deepseek-search-api`、`deepseek-fetch-api` |
| Workspace | `1ae4f7b3-efdc-4e1a-873e-64cfaf67cfa9` |
| Notebook | `b08d3291-fd3d-4e75-9602-4f987a976a0a` |
| 最终研究 | `a61bfc20-0af9-494b-99ec-efdda226524a` |
| 最终导读 | `495c4a53-b32c-482b-86bc-8917ed13379b` |
| 三点问答 | `6cf9bb3a-6f19-48f0-a2d6-82931dd8e931` |
| 边界追问 | `76cd2797-f45a-4a49-a9b5-fd46a650c619` |
| 最终 Studio 简报 | `1d1811b7-ad2e-4088-9049-e3a810ca83aa` |
| 代码基线 | `codex/notebook-workbench`，HEAD `caf91f3f73905fb43daac1dbfb42f475049ea4f4` 加当前未提交改动；不是该基线提交单独通过真实验收 |

## 真实链路证据

| 环节 | 可复核结果 |
| --- | --- |
| 搜索 | 最终研究的原生 trace 有 5 次 `web_search`，共 11 个查询，研究记录有 44 个去重候选。 |
| 网页读取 | 3 次 `web_fetch` 均返回 HTTP 200、正文非空，提供方均返回 `truncated=false`、未报告截断；URL 来自当轮真实搜索结果。 |
| 入库 | 在同一目标笔记本的前一轮 GUI 构建中新增 3 份正文；最终重试重新搜索和读取，并复用已有 3 份，未创建重复来源。两轮分开计数。 |
| 追踪与完整性 | 3 份正文共 59,155 字符；重新计算的 SHA-256 与库中 `content_hash` 全部一致；均有 `provenance.via=dsh-web-fetch`、请求 URL、获取时间和截断标记。 |
| 自动导读 | 3,996 字符，35 次完整来源 ID 引用，覆盖全部 3 个来源，无未知 UUID；`sourceRevision` 与当前启用来源一致。内容涵盖 TaskGroup、取消传播、timeout、Runner、同步原语、阅读顺序、误区和 3 道自测题及答案。 |
| 资料问答 | 三点问答的原生 turn 6 完成，执行 3 次 `notebook_search`，没有 `web_search` 或 `web_fetch`；3 个引用均归属当前笔记本。 |
| 例外追问 | 原生 turn 9 完成，调用 1 次 `notebook_source` 读取当前 TaskGroup 来源、0 次网页调用；1,046 字符回答中 5 次引用全部有效，四项重要断言有保存正文支持。 |
| 内容复核 | 导读重要断言与保存正文逐项核对。问答的普通失败取消、CancelledError 清理后传播、TimeoutError 在上下文外捕获均有来源支持。首次回答的 KeyboardInterrupt/SystemExit 例外遗漏由后续来源复核回答纠正。 |
| 界面 | 在实际 DSH 打开导读、查看问答、点击引用进入保存正文；插件热重载后来源、研究结果与历史问答仍可读取。本次没有为验证持久化重启整个 DSH 应用。 |

最终研究从 `1794847447149` 至 `1794847500164`，约 53 秒；这个数字只代表成功重试，不代表整个排查时间，也不是性能基准。

| 保存来源 | Source ID | 字符数 | 正文 SHA-256 |
| --- | --- | ---: | --- |
| [Coroutines and tasks](https://docs.python.org/3.14/library/asyncio-task.html) | `b0e3c718-f517-4c97-965d-8bfbe3a757cf` | 43,905 | `fb5f95fc373f6c6e1c9737acaec259583b0032cebdaed8ac16c283b2a084c60b` |
| [Runners](https://docs.python.org/3.14/library/asyncio-runner.html) | `7a7b807b-4230-468d-9bcb-10bda2a93a16` | 5,037 | `37a6e35c495a69151e9f1018b6ff66335c9d3d9136e8459891575b0c6950a934` |
| [Synchronization Primitives](https://docs.python.org/3.14/library/asyncio-sync.html) | `eed8d6ee-a145-4104-8117-814e6b846322` | 10,213 | `287003e37c102892d97a1767852631658abb93af4a06370106c0b0a7b9dd0921` |

## 联调发现与修复

1. **桌面已经登录，插件仍显示需要登录。** 旧 HTTP 接入与新版宿主认证通道不兼容。现在优先使用宿主认证 RPC，服务端注册对应 connection fetch 通道，处理双层返回；宿主认证失败不再降级绕过认证，旧版宿主保留原兼容路径。
2. **宿主已接入搜索，插件预检却找不到网页工具。** 新版 DSH 工具由 Agent preset scope 提供。预检、初始化、恢复与权限过滤改为使用实际 preset/Agent 的工具定义；Agent 准备成功后才创建新笔记本。
3. **网页抓取成功但没有资料入库。** PTC 的 `run_code` 成功结束后会回收并 abort 子信号，原实现提交时再次读取该信号而误丢成功结果。现在在收到最终结果时确认状态，等待外层成功再提交，仍拒绝外层失败或取消的暂存结果。对应回归覆盖了“成功后清理 abort”和真实取消的区别。
4. **学习导读漏掉资料中明明存在的核心章节。** 新的 `researchPassages` 对研究主题去重，优先覆盖明确的技术术语与 API 定义，补足相邻段落，跨来源轮流取证并控制总预算。导读的“检索片段未覆盖”与“整个资料库不存在”也已明确区分。
5. **引用和原生消息显示不一致。** 回答优先要求完整 `[sourceId]`；兼容历史回答的完整已知 `sourceId=UUID`，只识别当前笔记本真实 ID，不猜短 ID。宿主 runtime/time context 不再投影成用户消息，自动研究界面保留用户原始目标。
6. **规则解释过于绝对。** 资料问答提示要求保留关键条件和例外，片段不足时通过 `notebook_source` 查看上下文。真实追问已区分普通异常组与 KeyboardInterrupt/SystemExit 的重新抛出。
7. **正文与调用细节。** 补足 HTML 隐藏元素清理和保守的验证页识别；提示模型在持久化 PTC 环境中避免重复顶层变量声明，无参数工具显式传 `{}`，读取 URL 保持搜索结果原样。
8. **导读失败仅有笼统错误。** 直接生成调用改为使用配置中的 `assistantMaxTokens`（默认 8192），终止错误保留类型，超出 token 上限时给出预算及处理提示，不把部分输出记成成功。此前 `generation failed` 的历史根因无法从已持久化日志确认；不能因为调整预算后重试成功，就断言那次失败必然由 4096 token 上限造成。

## 普通 Studio 补充验收

自动导读通过后，继续在同一真实笔记本点击 Studio「简报」。这一步暴露了普通 Studio 仍使用旧取材路径的问题：虽然保存正文有核心内容，模型收到的却主要是版本变更条目，进而误称 TaskGroup、取消和超时资料不足。

已完成三项修复：

1. 普通 Studio 也使用多主题、相邻段落和跨来源覆盖的 `researchPassages`。显式生成要求优先；无要求时，仅在当前研究属于同一笔记本的条件下借用研究主题。旧研究请求作为背景，避免把原来的联网、建库、字数和自测要求再次执行成当前简报。
2. 生成提示提供真实来源元数据，包括 URL、已保存正文长度、提供方截断状态和本次选段长度，明确区分“已保存资料”与“本次送入模型的摘录”。文本引用使用实际工作台支持的完整来源 ID；JSON 产物继续遵循原有结构。
3. 学习指南、简报和报告统一使用来源引用组件；只把当前笔记本中已知的完整 ID 变为按钮，未知引用保留原文，并维持文本转义。

最终真实简报 `1d1811b7-ad2e-4088-9049-e3a810ca83aa` 为 `done`，正文 **2,618 字符、11 次有效引用、覆盖全部 3 个来源**，正文 SHA-256 为 `b38fc1fecb59b79967a2a4ce847fba317f49c6b1a5d51bc01ab4555f37e43a85`。五个核心主题都有保存正文支持；结构恢复为简报，没有继承旧任务的阅读顺序、自测章节，也没有再声称缺少已保存 URL 或来源正文。三个来源的正文哈希和修订号保持不变。

本轮普通 Studio 的真实生成样本为简报，没有扩展到七种产物的逐项真实模型验收。完整 LLM 请求未持久化；保存的产物请求包装与最终正文可查库复核，来源元数据传入路径由当前代码和回归测试核对。

原生界面重新加载后，已打开最终简报并观察到 11 个来源按钮。实际点击跳转另在保留的中间简报 `1212d3a6-73cb-451d-ad55-cf442430f45d` 上完成：点击 Coroutines and tasks 引用后打开保存正文，显示 Python 3.14 URL 和 `2026/11/17 00:40:30` 获取时间。两份产物使用同一引用组件；这里分别记录“最终简报按钮呈现”和“简报引用实际跳转”，不把中间简报的旧内容当作最终内容。

三份诊断简报与首次失败导读均保留。最终简报是概述，没有完整展开异常组和 KeyboardInterrupt/SystemExit 特例；需要这一精确规则时，应阅读本次资料问答的纠正记录或保存原文。该边界不等于资料库缺少这些内容。

## 回归与清理

- `npm test`：**112 / 112 通过**，0 失败、0 取消、0 跳过。
- `npm run test:ui`：**78 / 78 通过**，0 浏览器异常。报告明确标记 `fixtureOnly=true`；其中包含简报和报告的引用点击、未知引用与 HTML 转义回归。这组结果只代表模拟宿主界面测试，真实宿主证据另列于上文。
- 临时宿主验收 hook 已移除，`src/index.js` 与联调前备份一致；`cordis.patch.yml` 已恢复原始字节，SHA-256 为 `17e8f88b87508d80f9904f61738eb6bd6fe9091846488c4a9d26cd0624ad4a80`。没有为验收重启整个 DSH。
- 当前工作区包含本轮功能修复及此前已有的布局/粒子改动，均未提交或发布。最终代码与测试文件的哈希见下方清单，不以 HEAD 单独代表验收版本。

## 成果与证据文件

- [学习导读导出](../output/real-dsh-2026-11-17/learning-guide.md)：真实产物正文，增加 Markdown 来源链接定义便于离开 DSH 阅读。
- [资料问答及纠正记录](../output/real-dsh-2026-11-17/source-qa.md)：保留原始问题、首次回答、追问与纠正，不静默改写历史回答。
- [最终简报导出](../output/real-dsh-2026-11-17/briefing.md)：真实模型正文，增加来源链接定义，未改写模型内容。
- [导出元数据](../output/real-dsh-2026-11-17/export-metadata.json)：固定产物/消息 ID 和导读、简报正文哈希。
- [最终研究与三点问答 SQLite 证据](../output/real-dsh-2026-11-17/final-sqlite-evidence.json)、[原生工具 trace 摘要](../output/real-dsh-2026-11-17/final-native-evidence.json)、[内容复核](../output/real-dsh-2026-11-17/final-guide-review.md)。
- [异常规则追问证据](../output/real-dsh-2026-11-17/supplemental-qa-evidence.json)：独立保留直接读取原文、纠正特例的调用和内容依据。
- [最终 Studio 结构化证据](../output/real-dsh-2026-11-17/studio-final-verified.json)、[Studio 内容复核](../output/real-dsh-2026-11-17/studio-final-verified.md)、[原生界面观察记录](../output/real-dsh-2026-11-17/native-ui-observations.json)。
- [最终数据库状态](../output/real-dsh-2026-11-17/final-state.json)、[代码与验证清单](../output/real-dsh-2026-11-17/code-manifest.json)、[单元测试日志](../output/real-dsh-2026-11-17/unit-tests.log)、[模拟界面报告](../output/real-dsh-2026-11-17/ui-regression-report.json)。
- [历史导读失败快照](../output/real-dsh-2026-11-17/final-gui-generation-failed.json)、[失败诊断](../output/real-dsh-2026-11-17/final-gui-generation-diagnostics.json)：保留失败原貌，不与最终成功结果混用。

`output/` 与 `.local/` 是本机验收成果目录，均被 Git 忽略；它们可在当前工作区打开，不应被当作已提交或已发布的文件。

## 验收边界

这次证明当前 macOS、当前 DSH 安装版、当前提供方和这一实际任务可以跑通完整链路。不会把模拟宿主测试、一次成功样本或引用 ID 匹配，扩大为所有提供方、所有资料类型或所有回答准确率的保证。导读覆盖依据有预算的检索选段；短片段、复杂例外、资料冲突仍需要持续质量评测。

未实现的助学能力仍按[助学 Agent 调研](learning-agent-research-2026-11-16.md)区分：交互测验和闪卡、作答记录、引导学习、片段级引用定位、间隔复习，以及 PDF/讲义解析没有因为本轮真实联调完成而自动成为已实现功能。
