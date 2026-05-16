# DeepSeek / MiMo reasoning_content 回传适配设计文档

## 1. 概述

### 1.1 问题

DeepSeek 与小米 MiMo 的思考模式都要求 Agent 类产品在多轮工具调用场景中回传模型上一轮返回的 `reasoning_content`。如果历史消息里的 assistant turn 包含 `tool_calls`，后续请求必须把该 assistant turn 的完整 `reasoning_content` 一并放回 `messages`，否则服务端可能返回 400，或丢失工具调用前后的推理连续性。

DeepSeek 官方文档已在“思考模式”中说明 `reasoning_content` 是返回给调用方并用于后续请求的字段。小米 MiMo 的官方适配说明也单独给出“回传 `reasoning_content`”指南，并且 MiMo 官方模型卡进一步强调后续请求需要保留历史 `reasoning_content`。

### 1.2 目标

1. DeepSeek 与 MiMo 默认使用 OpenAI Chat Completions 兼容格式，Anthropic 兼容格式只作为可切换路径保留。
2. DeepSeek 默认开启思考模式；此前为了规避工具调用异常而强行默认关闭 DeepSeek V4 思考的补丁，应在 `reasoning_content` 回传打通后移除或改写。
3. DeepSeek 与 MiMo 在开启思考模式、发生工具调用、继续会话时，不因为缺失 `reasoning_content` 被服务端拒绝。
4. OpenAI Chat Completions 兼容路径与 Anthropic 兼容路径都要有明确策略，不能只依赖偶然的字段透传。
5. 只回传模型真实返回的推理内容，不从普通 `content` 合成 `reasoning_content`。
6. reasoning 回传作为模型协议字段处理，不改变现有 UI 的“思考过程”展示语义。
7. 覆盖 DeepSeek 与 MiMo 的单元测试，避免后续升级 OpenClaw 或 provider 配置时回归。

### 1.3 非目标

1. 本文档不实现代码。
2. 不重新设计用户可见的模型选择、API Key 配置、Base URL 配置流程；本次只调整 provider 默认格式与内部协议适配。
3. 不新增“显示完整推理过程”的产品开关；UI 继续沿用现有 reasoning 展示能力。
4. 不为没有返回 `reasoning_content` 的模型强行补字段。

## 2. 现状分析

### 2.1 Provider 配置现状

`src/shared/providers/constants.ts` 中：

1. 当前代码中，DeepSeek 默认使用 Anthropic 兼容地址 `https://api.deepseek.com/anthropic`，可切换 OpenAI 兼容地址 `https://api.deepseek.com`。本次方案要求调整为默认 OpenAI 兼容格式，Anthropic 地址保留为可切换选项。
2. 当前代码中，Xiaomi 默认使用 Anthropic 兼容地址 `https://api.xiaomimimo.com/anthropic`，可切换 OpenAI 兼容地址 `https://api.xiaomimimo.com/v1/chat/completions`。本次方案要求调整为默认 OpenAI 兼容格式，Anthropic 地址保留为可切换选项。

`src/main/libs/openclawConfigSync.ts` 中：

1. DeepSeek 与 Xiaomi 都通过 `mapApiTypeToOpenClawApi()` 根据用户选择映射到 OpenClaw transport。
2. DeepSeek 与 Xiaomi 的默认 provider 配置需要从 Anthropic-compatible 切到 OpenAI-compatible，包括 `defaultApiFormat`、默认 base URL、运行时同步到 OpenClaw 的 api 类型。
3. Gemini 有 `modelDefaults.reasoning: true`，但 DeepSeek 与 Xiaomi 没有 reasoning 默认值或模型级动态 reasoning 标记。
4. DeepSeek 与 Xiaomi 没有 provider-owned replay policy 配置，也没有在 LobsterAI 侧显式声明“这类模型需要 reasoning 回放”。

### 2.2 已有能力

LobsterAI 已有几段基础能力可复用：

1. `src/main/libs/coworkOpenAICompatProxy.ts` 已能从 OpenAI 兼容流式响应中读取 `delta.reasoning_content` / `delta.reasoning`，并转成 Anthropic `thinking` block。
2. `src/main/libs/coworkFormatTransform.ts` 已能把 Anthropic `thinking` block 转成 OpenAI assistant message 的 `reasoning_content`，也能反向把 `message.reasoning_content` 转成 `thinking` block。
3. renderer 侧 `src/renderer/services/api.ts` 已经会读取 OpenAI 兼容响应里的 reasoning delta，用于普通聊天接口的展示。
4. `scripts/patches/v2026.4.14/openclaw-deepseek-v4-thinking-mode.patch` 已经为 DeepSeek V4 增加显式 thinking 开关，并在默认 `thinking=off` 时关闭 provider thinking；这是为了绕开当时工具调用续轮缺失 `reasoning_content` 的异常。

这些能力说明：字段转换的底层零件已经存在，但还不能证明 DeepSeek / MiMo 的工具调用续轮一定满足新要求。新的目标不是继续默认关闭 DeepSeek 思考，而是补齐回传后恢复 DeepSeek 默认思考开启。

### 2.3 当前缺口

#### 缺口 A：MiMo 没有 DeepSeek 同级别的 thinking/replay 适配

现有补丁只覆盖 DeepSeek V4。Xiaomi/MiMo 没有对应 wrapper，也没有测试证明：

1. MiMo 返回的 `reasoning_content` 会被稳定保存到 assistant message。
2. 后续带 `tool_calls` 的 assistant history 会完整回传 `reasoning_content`。
3. 默认 OpenAI 兼容路径下，MiMo reasoning 能按 `reasoning_content` 保存并回传；Anthropic 兼容路径作为可切换路径时，也不会把 MiMo reasoning 当成普通可见文本或丢弃。

因此，MiMo 当前不能被视为已满足官方新要求。

#### 缺口 B：DeepSeek 现有补丁是关闭思考的 workaround，不是最终方案

DeepSeek V4 补丁解决的是“工具调用续轮缺少 `reasoning_content` 时服务端报错”的阶段性问题：通过默认关闭思考来降低触发概率。这个方向与新的目标相反。打通 `reasoning_content` 回传后，应让 DeepSeek 默认开启思考，并删除或改写这个默认关闭思考的逻辑。

当前还没有在 LobsterAI 仓库内验证：

1. `deepseek-reasoner` / `deepseek-v4-*` 返回 `reasoning_content` 后会在工具调用续轮回放。
2. OpenAI 兼容路径与 Anthropic 兼容路径行为一致。
3. assistant message 同时包含 `reasoning_content`、`content`、`tool_calls` 时序列化形状符合 DeepSeek 文档。

所以 DeepSeek 是“部分支持”：可以接收/转换部分 reasoning 字段，但默认思考策略仍被旧 workaround 影响，且缺少完整回传验证。

#### 缺口 C：没有针对 reasoning_content 回放的本仓库测试

`src/main/libs/coworkOpenAICompatProxy.test.ts` 当前主要覆盖 Responses 工具调用事件顺序与参数增量，没有覆盖：

1. OpenAI stream 中 `delta.reasoning_content` 到 Anthropic `thinking_delta` 的转换。
2. Anthropic `thinking` block 到 OpenAI `reasoning_content` 的历史回放。
3. assistant `tool_calls` 与 `reasoning_content` 同时存在时的请求体。
4. DeepSeek 的模型级判断，以及 Xiaomi 的 provider 级新策略 routing 行为。

## 3. 用户场景

### 场景 1：MiMo 工具调用后继续会话

**Given** 用户选择 Xiaomi provider 下任一 MiMo 模型，默认走 OpenAI 兼容格式，并开启模型思考模式。

**When** 第一轮 assistant 返回 `reasoning_content` 和 `tool_calls`，工具执行后用户继续发消息。

**Then** 后续请求中的上一轮 assistant message 必须包含原始 `reasoning_content`、原始 `tool_calls` 与必要的 `content` 字段，不能只回传工具调用。

### 场景 2：DeepSeek V4 思考模式工具调用

**Given** 用户选择 DeepSeek V4 / DeepSeek Reasoner，默认走 OpenAI 兼容格式，且 DeepSeek 默认开启思考模式。

**When** OpenClaw 构造下一轮请求 history。

**Then** 同一模型的历史 assistant thinking block 应被序列化为 `reasoning_content`，不应因为 thinking level、history sanitization 或 cross-format transform 被丢弃。

### 场景 3：用户切换模型

**Given** 历史里存在 MiMo 或 DeepSeek 返回的 reasoning。

**When** 用户切到另一个 provider 或另一个 API 格式。

**Then** 不能把 provider-specific reasoning 当作新模型的合法 `reasoning_content` 盲目透传；应按现有 cross-model 策略降级或剥离，避免污染另一个模型的协议上下文。

## 4. 功能需求

### FR-1：DeepSeek 与 Xiaomi 默认使用 OpenAI 兼容格式

1. DeepSeek 的默认 `defaultApiFormat` 应调整为 OpenAI-compatible，默认 base URL 使用 `https://api.deepseek.com`。
2. Xiaomi/MiMo 的默认 `defaultApiFormat` 应调整为 OpenAI-compatible，默认 base URL 使用现有 OpenAI-compatible 地址，并在同步到 OpenClaw 时规范化为 transport 期望的 base URL。
3. Anthropic-compatible 地址继续保留在可切换 base URL 中，但不再作为 DeepSeek 和 Xiaomi 的默认路径。
4. 默认格式调整后，设置页、配置持久化、OpenClaw config sync、API 连通性测试都应以 OpenAI-compatible 为默认预期。

### FR-2：DeepSeek 默认开启思考

1. DeepSeek reasoning 模型默认应开启思考模式，尤其是 `deepseek-reasoner` 与 `deepseek-v4-*`。
2. 旧的 DeepSeek V4 默认关闭思考 workaround 只应在用户显式选择 `thinking=off` 时生效，不能继续作为默认行为。
3. 如果 OpenClaw 仍需要显式 payload 才能表达默认思考开启，应注入 provider 认可的 thinking enabled 参数，而不是依赖服务端隐式默认值。
4. `thinking=off` 仍然要可用，用于用户明确要求快速或禁用思考的场景。

### FR-3：统一识别可回放 reasoning_content 的模型

建立集中判断逻辑，识别 DeepSeek 与 Xiaomi/MiMo 的 reasoning 回传需求：

1. DeepSeek：至少覆盖 `deepseek-reasoner`、`deepseek-v4-*`，并允许后续追加 `deepseek-r1` / `deepseek-v3.2` 等模型。
2. Xiaomi/MiMo：Xiaomi provider 下的全部模型都适用新策略，不在 spec 或实现里维护 MiMo 模型白名单。
3. 判断逻辑应优先使用 provider 级判断；只有 DeepSeek 这类需要区分 reasoning 模型的 provider 才做模型级判断。

### FR-4：保存模型返回的 reasoning_content

对 OpenAI Chat Completions 兼容响应：

1. stream：读取 `choices[].delta.reasoning_content`。
2. non-stream 或 fallback：读取 `choices[].message.reasoning_content`。
3. 保存为 assistant thinking block，并用 `thinkingSignature: 'reasoning_content'` 或等价内部标记记录原字段名。

对 Anthropic 兼容响应：

1. 如果 provider 原生返回 Anthropic `thinking` block，保留为 thinking block。
2. 如果 provider 在 Anthropic 兼容接口里返回 OpenAI 风格 `reasoning_content`，需要在 wrapper 中规范化为 thinking block。

### FR-5：回放同模型 reasoning_content

构造下一轮请求时，如果历史 assistant message 同时满足：

1. provider/model/API 与当前请求一致；
2. thinking block 来自 `reasoning_content`；
3. assistant turn 包含 `tool_calls`，或后续 history 包含对应 `tool` result；

则必须把 thinking block 序列化回 assistant message 的 `reasoning_content` 字段。

### FR-6：不合成、不跨模型滥用 reasoning_content

1. 不从普通 assistant 文本生成 `reasoning_content`。
2. 不把其他 provider 的 thinking block 作为 DeepSeek/MiMo 的 `reasoning_content`。
3. 切换 provider、切换 API 格式、切换模型时，遵循现有 replay policy：能安全降级为普通文本则降级，否则剥离 provider-specific thinking 元数据。

### FR-7：显式处理 thinking 开关

DeepSeek 已有 V4 wrapper，但需要从“默认关闭思考”改为“默认开启思考，显式 off 才关闭”；MiMo 需要补齐等价策略：

1. 当用户/运行时明确 `thinking=off`，请求体应显式关闭 provider thinking。
2. 当用户/运行时未显式关闭 thinking 时，DeepSeek 默认开启 thinking，并保留服务端要求的 reasoning 回传路径。
3. 若 MiMo 的关闭/开启参数与 DeepSeek 不同，应在 MiMo wrapper 中隔离，不复用 DeepSeek 的 payload 形状。

## 5. 实现方案

### 5.1 LobsterAI 侧 provider 默认配置

在 `src/shared/providers/constants.ts` 与 `src/main/libs/openclawConfigSync.ts` 中调整 DeepSeek / Xiaomi 的默认配置：

1. DeepSeek 的 `defaultApiFormat` 改为 OpenAI-compatible，`defaultBaseUrl` 改为 `https://api.deepseek.com`。
2. Xiaomi 的 `defaultApiFormat` 改为 OpenAI-compatible，`defaultBaseUrl` 改为现有 OpenAI-compatible 地址；如果地址包含 `/chat/completions`，同步到 OpenClaw transport 前必须继续使用现有 URL 规范化逻辑。
3. Anthropic-compatible URL 保留在 `switchableBaseUrls.anthropic` 中。
4. `ProviderRegistry`、设置页默认值、配置迁移和 `buildProviderSelection()` 测试都要覆盖默认 OpenAI-compatible 的输出。

### 5.2 LobsterAI 侧 provider reasoning 元数据

在 `src/main/libs/openclawConfigSync.ts` 的 provider descriptor 中为 DeepSeek / Xiaomi 增加可测试的 reasoning 能力标记：

1. 通过 `resolveModelReasoning()` 对 DeepSeek reasoning 模型返回 `true`，对 Xiaomi provider 下所有模型返回 `true`。
2. DeepSeek 的非 reasoning 模型保持 `undefined`；Xiaomi 不做模型级排除，避免后续新增 MiMo 模型时漏适配。
3. 同步更新 `src/main/libs/openclawConfigSync.test.ts` 覆盖 DeepSeek 与 Xiaomi 的模型配置输出。

这个标记不能单独解决回放问题，但能让 OpenClaw transport 明确知道该模型可能携带 reasoning。

### 5.3 OpenClaw 补丁：provider-owned replay policy

在 `scripts/patches/v2026.4.14/` 新增或扩展 OpenClaw patch：

1. 新增或扩展 provider-owned replay policy：识别 OpenAI-style `reasoning_content` thinking block，并在同模型 replay 时序列化回 assistant message。
2. 对 DeepSeek 与 Xiaomi provider 注册 replay policy，避免 reasoning block 被 history sanitization 删除。
3. 改写 `openclaw-deepseek-v4-thinking-mode.patch`：删除默认关闭 DeepSeek V4 thinking 的 workaround；只在显式 `thinking=off` 时注入关闭参数。
4. 如果 DeepSeek 默认开启 thinking 需要显式 payload，则在未显式 off 时注入 provider 认可的 thinking enabled 参数。
5. 为 Xiaomi/MiMo 新增 stream wrapper，例如 `mimo-stream-wrappers.ts`，处理 MiMo 的 thinking 开关和 `reasoning_content` 回放要求。

### 5.4 OpenAI 兼容代理测试

在 `src/main/libs/coworkOpenAICompatProxy.test.ts` 增加单元测试：

1. `delta.reasoning_content` 会输出 Anthropic `thinking_delta`。
2. assistant thinking block 经 `anthropicToOpenAI()` 后生成 `reasoning_content`。
3. assistant 同时有 thinking 与 tool_use 时，转换结果同时包含 `reasoning_content` 与 `tool_calls`。
4. fallback completed response 中的 `message.reasoning_content` 不会丢失。

### 5.5 OpenClaw patch 测试

OpenClaw patch 应包含或修改以下测试：

1. DeepSeek OpenAI completions 默认开启 thinking：未传 `thinking=off` 时 payload 不应被旧 workaround 改成 disabled。
2. DeepSeek OpenAI completions：第一轮返回 `reasoning_content + tool_calls`，第二轮 payload 的 assistant message 包含 `reasoning_content`。
3. MiMo OpenAI completions：同上，覆盖 Xiaomi provider 级策略，验证实现不依赖 MiMo 模型 ID 白名单。
4. Anthropic-compatible fallback：如用户切换到 Anthropic 兼容格式，provider 返回 OpenAI-style reasoning delta 时 wrapper 能规范化并回放。
5. `thinking=off`：只有显式 off 时才关闭 thinking；关闭后不应产生需要回放 reasoning 的请求形态。
6. cross-model：从 MiMo 切到 DeepSeek 或其他 provider，不透传 MiMo 的 `reasoning_content`。

### 5.6 兼容性与安全边界

1. reasoning 内容应进入内部会话记录，用于协议回放；是否对用户显示继续由现有 UI 控制。
2. 日志不得打印完整 `reasoning_content`，避免泄露长推理文本。
3. 上下文压缩或历史裁剪时，若保留 assistant tool call，则应保留同 turn 的 reasoning；若裁剪 reasoning，则应同时裁剪该不完整 tool-call turn 或禁用回放。
4. 对没有返回 reasoning 的历史 turn，不补空字符串字段，避免服务端把空 reasoning 视为格式错误。

## 6. 涉及文件

LobsterAI：

1. `src/shared/providers/constants.ts`
2. `src/main/libs/openclawConfigSync.ts`
3. `src/main/libs/openclawConfigSync.test.ts`
4. `src/shared/providers/constants.test.ts`
5. `src/renderer/config.ts`
6. `src/renderer/services/config.ts`
7. `src/main/libs/coworkOpenAICompatProxy.ts`
8. `src/main/libs/coworkOpenAICompatProxy.test.ts`
9. `src/main/libs/coworkFormatTransform.ts`

OpenClaw patches：

1. 改写或删除 `scripts/patches/v2026.4.14/openclaw-deepseek-v4-thinking-mode.patch` 中“默认关闭 DeepSeek V4 思考”的逻辑。
2. 新增 `scripts/patches/v2026.4.14/openclaw-deepseek-mimo-reasoning-replay.patch`

如果后续升级 OpenClaw 到包含官方修复的版本，应优先删除本地 patch，并用 LobsterAI 侧测试锁定行为。

## 7. 验证计划

### 7.1 单元测试

1. `npm test -- coworkOpenAICompatProxy`
2. `npm test -- openclawConfigSync`
3. `npm test -- providers`
4. OpenClaw patch 对应的 targeted tests，例如 completions reasoning replay、DeepSeek thinking wrapper、MiMo wrapper。

### 7.2 集成验证

1. 默认配置：新装或重置配置后，DeepSeek 与 Xiaomi 都默认使用 OpenAI-compatible 地址和 api 类型。
2. Xiaomi/MiMo：任选当前可用的 MiMo 模型发起会调用工具的任务，确认第二轮请求不再出现 400。
3. DeepSeek V4 Pro / DeepSeek Reasoner：默认开启思考，发起会调用工具的任务，确认第二轮请求回传 `reasoning_content` 且不再出现 400。
4. thinking off：用户显式关闭 thinking 时，请求才关闭 provider thinking，且不会要求回传 reasoning。
5. 切换模型：MiMo 会话切换到其他模型后不携带 MiMo 的 provider-specific reasoning 字段。

### 7.3 回归关注

1. 不影响 qwen、moonshot、minimax、openrouter 的 reasoning 或 tool-call 行为。
2. 不影响普通非工具调用聊天。
3. 不把 `reasoning_content` 写入 info 级日志。
4. 不导致上下文压缩后的 tool-call history 变成不完整协议片段。

## 8. 参考资料

1. DeepSeek 思考模式文档：https://api-docs.deepseek.com/zh-cn/guides/thinking_mode
2. 小米 MiMo reasoning_content 回传文档：https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/passing-back-reasoning_content
3. XiaomiMiMo 官方模型卡：https://huggingface.co/XiaomiMiMo/MiMo-V2-Flash-Base/blame/main/README.md
4. OpenClaw MiMo 适配 issue：https://github.com/openclaw/openclaw/issues/60261
5. OpenClaw MiMo 适配 PR：https://github.com/openclaw/openclaw/issues/60304
