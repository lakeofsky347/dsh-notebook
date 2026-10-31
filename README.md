# DSH Notebook

DSH 的笔记本研究工作台。可以从普通对话管理笔记本，也可以在插件界面选择已配置模型，直接对话、搜集资料、组织来源和生成 Studio 内容。模型接口与凭据由 DSH 管理。

## 使用方式

在侧栏或对话内打开「笔记本」，创建一个工作台会话，选择 DSH 模型提供方和模型。工作台会话可以独立使用，不需要先关联普通对话；会话记录、模型选择、模式和笔记本绑定保存在当前 profile 的 SQLite 资料库中。

- **搜集构建**：描述研究目标，例如「搜集关于海洋碳汇的一手资料，建立笔记本，并整理研究方法和争议」。模型可以创建笔记本、调用 DSH 的 `web_search` / `web_fetch`、导入 URL 或指定的本地文本文件、保存笔记。界面显示真实回复、工具进度和新增来源，可以停止当前运行。
- **资料问答**：打开已有笔记本并勾选来源，围绕资料提问。此模式不开放网页搜索工具，回答依据选中的资料；资料缺失时需要切换至搜集构建后补充。
- **普通对话管理**：在 DSH 对话中要求模型创建或打开笔记本、添加或管理来源、检索资料、生成产物。要求搜集资料时，模型可通过 `notebook_research` 启动工作台研究，再用 `notebook_workbench_status` 读取进度。新研究会话会出现在工作台的会话列表中。
- **关联当前对话**：将工作台当前笔记本绑定给宿主中打开的对话。随后两处操作使用同一份资料；笔记本与来源状态通过界面轮询更新。

联网搜索依赖 DSH 已配置并可用的网页工具及搜索提供方。没有搜索提供方时，可以提供具体 URL 或本地文件路径；插件不会伪造搜索结果。原生 Agent 工具执行继续经过 DSH 的权限和审批流程，工作台不会自动批准被拦截的操作。

界面中的蓝白粒子场会在鲸形与流体形态之间缓慢变化，响应指针的局部扰动，并随模型思考、资料搜集和内容生成调整运动状态。开始对话后，空态粒子舞台缩为顶部活动条。粒子绘制最多 30fps，离开视野或页面隐藏时暂停；系统开启「减少动态效果」时保留静态粒子。

## 来源与 Studio

支持粘贴文本、HTTP(S) 网页、本地 `.txt`、`.md`、`.markdown`、`.csv`、`.json`、`.text` 文件，以及工具创建的笔记。本地文件通过绝对路径读取，不是浏览器上传。可以勾选来源、查看保存的正文、重命名和删除来源。

HTML 导入使用 DOM 解析提取文字、标题与链接，移除脚本等非正文内容，不执行网页 JavaScript；依赖登录、动态渲染或反爬验证的页面可能无法完整导入。PDF、Word、音视频暂未提供解析。

选中的正文按段落和重叠窗口切片，使用支持中英文的 BM25 检索。未提供向量数据库或语义嵌入。Studio 支持学习指南、简报、报告、闪卡、测验、思维导图、数据表，使用工作台选定模型，根据检索片段生成；未命中关键词时从选中来源轮流选取片段。结果保存生成时的来源修订号，界面自动刷新完成或失败状态。目前产物采用文字或 JSON 预览。

## 运行与数据

需要 Node.js ≥ 24.9.0 和 DSH `>=0.2.1-rc.5 <0.3.0`。通过 profile bundle 加载 `cordis.patch.yml`，客户端由宿主模块加载器注入 React。

资料默认保存在 profile 的 `plugin-data/dsh-notebook/library.sqlite`；也可用插件 `dataDir` 指定目录。已有资料库会自动增加工作台表，保留原笔记本、来源、产物和会话绑定。工作台的完整模型上下文由 DSH 原生 Session 记录；SQLite 消息是用于界面显示的投影。重启后续聊要求宿主仍能读取该 Session 的持久化日志；缺失日志时会明确报错，历史界面记录仍可查看。

主要配置包括 `maxNotebooks`、`maxSourcesPerNotebook`、`maxUploadBytes`、`maxWordsPerSource`、`chunkChars`、`chunkOverlap`、`topK`、`maxInjectChars`、`urlTimeoutMs` 和 `maxUrlBytes`。`assistantMaxSteps`（默认 24）、`assistantTimeoutMs`（默认 180000）和 `assistantMaxTokens`（默认 8192）约束一次工作台运行；`maxChatChars` 默认 32000。

## 开发与验证

```sh
npm ci --legacy-peer-deps
npm test
npm run dev
npm run test:ui
```

开发预览默认位于 `http://127.0.0.1:8765/dev/preview.html`，使用模拟宿主和模拟模型，不调用真实供应商。`test:ui` 自动启动临时本地服务与 Chrome，保存报告和桌面、窄屏截图至 `output/dev-smoke/`；可通过 `CHROME_BIN` 指定 Chromium 可执行文件。

`npm run preview:particles` 使用现有 Chrome 和 ffmpeg 录制当前真实画布，输出 6 秒 MP4、GIF 和截图至 `output/particles/`；可通过 `FFMPEG_BIN` 指定 ffmpeg 路径。录制使用开发模拟数据，不调用模型。

核心测试覆盖资料隔离、工作台持久化、中文检索、原生事件投影、工具管理与模式限制、模型选择、取消与恢复，以及接口行为。模拟宿主测试与浏览器预览不等同于真实 DSH 桌面验收或供应商模型调用。

## 代码位置

| 文件 | 职责 |
| --- | --- |
| `src/index.js` | 插件配置、DSH 注入入口 |
| `src/service.js` | 共享工具与 HTTP 操作、模型目录、笔记本上下文、Studio 后台任务 |
| `src/workbench.js` | 原生 Agent 生命周期、选定模型、流式与正式事件投影、停止和恢复 |
| `src/library.js` | SQLite 笔记本、来源、工作台、消息和产物 |
| `src/text.js` / `src/url-text.js` | 切片、检索、预算和网页正文提取 |
| `src/client.js` | 工作台界面与宿主槽位 |
