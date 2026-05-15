# Keyfrom 渠道归因本地能力设计文档

## 1. 概述

### 1.1 问题/背景

LobsterAI 需要支持渠道包投放统计。不同投放渠道在打包或开发启动时传入不同 `keyfrom`，应用安装并启动后需要把渠道来源稳定记录到本地，为后续登录、支付、埋点和报表统计提供基础数据。

第一阶段先完成客户端本地归因能力，不接入登录、支付或接口上报。也就是说，本阶段只解决以下问题：

- 开发模式和打包模式都能注入当前渠道来源。
- 应用启动后能读取当前包的 `keyfrom`。
- 本地持久化 `firstKeyfrom` 和 `latestKeyfrom`。
- `firstKeyfrom` 只在首次为空时写入，后续不覆盖。
- `latestKeyfrom` 每次启动都按当前包来源更新。
- 开发者可以在开发模式下模拟不同渠道并验证本地归因结果。

### 1.2 目标

1. 统一使用 `keyfrom` 作为渠道来源业务字段名。
2. 支持通过环境变量在开发模式和打包模式中注入渠道参数。
3. 启动时把当前渠道归一化为合法 `keyfrom`，无值时使用默认渠道。
4. 本地维护两个字段：
   - `firstKeyfrom`: 首次归因来源，只写一次，不自动覆盖。
   - `latestKeyfrom`: 最近一次来源，每次启动可更新。
5. 将归因结果存入 SQLite `kv` 表，应用重启后保持不丢失。
6. 提供主进程内部读取能力，供后续登录、接口上报或埋点模块复用。
7. 提供开发模式验证路径，避免必须真实打多个安装包才能测试。
8. 保持实现轻量，不新增数据库表。

### 1.3 非目标

本阶段不做以下事情：

- 不在登录接口中携带 `firstKeyfrom` 或 `latestKeyfrom`。
- 不在支付接口中携带 `firstKeyfrom` 或 `latestKeyfrom`。
- 不修改 `fetchWithAuth()` 或其他 API 请求封装。
- 不实现服务端用户归因绑定。
- 不实现渠道报表、后台统计、合作方结算逻辑。
- 不实现广告点击归因、下载链接归因、IP/设备指纹匹配。
- 不实现邀请码、campaign、广告组、素材维度。
- 不提供面向普通用户的渠道编辑 UI。
- 不允许普通生产用户手动覆盖 `firstKeyfrom`。

## 2. 用户场景

### 场景 1: 开发模式模拟官方渠道

**Given** 开发者未传入渠道参数  
**When** 开发者运行 `npm run electron:dev`  
**Then** 应用启动后读取当前渠道为默认渠道

**And** 如果本地没有 `firstKeyfrom`，写入默认渠道

**And** `latestKeyfrom` 更新为默认渠道

### 场景 2: 开发模式模拟指定渠道

**Given** 开发者希望模拟 B 站渠道  
**When** 开发者运行 `KEYFROM=bilibili npm run electron:dev`  
**Then** 应用启动后读取当前渠道为 `bilibili`

**And** 如果本地没有 `firstKeyfrom`，写入 `bilibili`

**And** `latestKeyfrom` 更新为 `bilibili`

### 场景 3: 首次归因不被后续渠道覆盖

**Given** 用户第一次启动的是 `bilibili` 渠道包  
**And** 本地已经写入 `firstKeyfrom=bilibili`  
**When** 用户后续安装并启动 `partner_a` 渠道包  
**Then** `firstKeyfrom` 仍保持 `bilibili`

**And** `latestKeyfrom` 更新为 `partner_a`

### 场景 4: 应用重启后保留归因结果

**Given** 本地已经保存 `firstKeyfrom=bilibili` 和 `latestKeyfrom=partner_a`  
**When** 用户退出并重新打开应用  
**Then** 应用可以从 SQLite 中读取已有归因结果

**And** 不因重启丢失 `firstKeyfrom`

### 场景 5: 渠道参数非法时使用默认渠道

**Given** 打包或开发启动时传入非法渠道值  
**When** 应用启动归因初始化  
**Then** 应用不写入非法原始值

**And** 当前渠道回退为默认渠道

**And** 日志以 warning 记录渠道值非法，但不阻塞应用启动

### 场景 6: 开发者需要重测首次归因

**Given** 开发者本地已经存在 `firstKeyfrom`  
**When** 开发者需要重新模拟首次安装  
**Then** 可以通过开发文档中的清理方式删除本地归因 kv

**And** 再次启动后按当前 `KEYFROM` 重新初始化 `firstKeyfrom`

说明：本阶段不要求在产品 UI 中提供重置入口。可以先通过开发工具、SQLite 检查或后续内部调试入口完成。

## 3. 功能需求

### FR-1: keyfrom 字段定义

本阶段只定义两个持久化字段：

```ts
type KeyfromAttribution = {
  firstKeyfrom: string;
  latestKeyfrom: string;
  updatedAt: number;
};
```

字段语义：

| 字段            | 含义                 | 覆盖规则                           |
| --------------- | -------------------- | ---------------------------------- |
| `firstKeyfrom`  | 本机首次归因来源     | 仅当本地为空时写入，后续不自动覆盖 |
| `latestKeyfrom` | 本机最近一次启动来源 | 每次启动按当前包来源更新           |

### FR-2: 当前渠道来源

当前渠道来源统一称为 `currentKeyfrom`，它不需要单独持久化为长期字段，只作为启动时计算 `firstKeyfrom` 和 `latestKeyfrom` 的输入。

来源优先级：

1. 开发模式运行时注入的环境变量 `KEYFROM`。
2. 生产包构建期固化到应用资源文件中的渠道值。
3. 默认渠道 `official`。

说明：

- 开发模式可以直接读取 `process.env.KEYFROM`。
- 生产包不能依赖用户运行环境中的 `KEYFROM`，需要在构建阶段把渠道值固化到应用内。
- 生产包运行时不读取当前工作目录下的 `.keyfrom-build`，避免被外部 cwd 或本机残留文件影响。
- 如果后续支持更多构建系统，应保持对外入口仍是 `KEYFROM`。

### FR-3: 渠道值校验与归一化

`keyfrom` 必须经过校验和归一化后才能写入本地。

建议规则：

- 去除首尾空白。
- 转为小写。
- 仅允许 `a-z`、`0-9`、`_`、`-`。
- 长度建议为 1 到 64 个字符。
- 空值或非法值回退为 `official`。

示例：

| 原始值      | 归一化结果  |
| ----------- | ----------- |
| `bilibili`  | `bilibili`  |
| `Partner_A` | `partner_a` |
| 空字符串    | `official`  |
| `../../bad` | `official`  |

### FR-4: 本地持久化规则

应用启动时执行一次归因初始化：

```ts
const currentKeyfrom = resolveCurrentKeyfrom();
const existing = readKeyfromAttribution();

const firstKeyfrom = existing.firstKeyfrom || currentKeyfrom;
const latestKeyfrom = currentKeyfrom;

saveKeyfromAttribution({
  firstKeyfrom,
  latestKeyfrom,
  updatedAt: Date.now(),
});
```

要求：

- `firstKeyfrom` 已存在时不覆盖。
- `latestKeyfrom` 每次启动都更新。
- 写入应幂等，多次启动同一渠道不会产生异常。
- SQLite 写入失败时记录 error，但不阻塞应用主流程。

默认包示例：

- 如果打包时没有传 `KEYFROM`，构建期渠道为 `official`。
- 如果用户首次启动的是默认包，SQLite 中保存：

```json
{
  "firstKeyfrom": "official",
  "latestKeyfrom": "official",
  "updatedAt": 1789473600000
}
```

- 如果同一台机器后续启动 `bilibili` 渠道包，则更新为：

```json
{
  "firstKeyfrom": "official",
  "latestKeyfrom": "bilibili",
  "updatedAt": 1789473600000
}
```

说明：`firstKeyfrom` 表示第一次来源，不覆盖；`latestKeyfrom` 表示最近一次包来源，会更新。

### FR-5: 存储位置

使用现有 SQLite `kv` 表，不新增数据库表。

建议 kv key：

```ts
KeyfromStoreKey.Attribution = 'keyfrom.attribution.v1';
```

value 示例：

```json
{
  "firstKeyfrom": "bilibili",
  "latestKeyfrom": "partner_a",
  "updatedAt": 1789473600000
}
```

说明：

- 后续如果需要拆字段存储，可以新建 v2 key 并做迁移。
- 本阶段不需要把归因数据写入 `cowork_config` 或应用配置对象。

### FR-6: 主进程读取能力

主进程需要提供内部服务方法：

```ts
getKeyfromAttribution(): KeyfromAttribution
```

用于后续模块读取，不要求本阶段暴露给 renderer。

可选提供开发调试 IPC：

```ts
KeyfromIpc.GetAttribution;
```

如果添加 IPC channel，必须放入集中常量对象，不能在 `ipcMain.handle()` 或 `ipcRenderer.invoke()` 中使用裸字符串。

### FR-7: 打包渠道注入

打包时支持：

```bash
KEYFROM=bilibili npm run dist:mac:x64
KEYFROM=bilibili npm run dist:mac:arm64
KEYFROM=bilibili npm run dist:win
```

构建产物需要能在应用启动时读到固化后的渠道值。

建议实现方式：

1. 新增构建期脚本读取 `process.env.KEYFROM`。
2. 生成一个受版本控制忽略的构建产物文件，例如 `src/generated/keyfrom.json` 或 `dist-electron/keyfrom.json`。
3. 主进程启动时读取该文件作为生产包渠道值。
4. 开发模式下如果环境变量存在，优先使用环境变量，方便本地调试。

说明：

- 具体文件路径在实现时以打包可访问、asar 兼容、主进程易读取为准。
- 生成文件应避免被误提交，或使用稳定模板加运行时替换。
- 现有打包命令不需要替换；渠道通过命令前缀环境变量传入。
- 当前项目的 `dist:mac:x64`、`dist:mac:arm64`、`dist:win` 内部都会执行 `npm run build` 或等价构建流程，因此可以通过 `prebuild` 自动生成渠道固化文件。
- 生产包运行时不应依赖用户机器上的 `KEYFROM` 环境变量，避免被本机环境意外覆盖；正式包应读取构建期固化到 `resources/keyfrom/keyfrom.json` 的值。
- 如果没有传 `KEYFROM`，构建期固化为默认渠道 `official`。
- `.keyfrom-build/` 是打包前的临时中间目录，不是运行期业务数据目录，也不应提交到 Git。

### FR-8: 渠道包产物命名

渠道包产物应能从文件名上区分来源，便于投放和人工核对。

建议命名：

```text
LobsterAI-<version>-<platform>-<arch>-<keyfrom>.<ext>
```

示例：

```text
LobsterAI-2026.5.14-mac-arm64-bilibili.dmg
LobsterAI-2026.5.14-win-x64-partner_a.exe
```

第一版可以先在打包脚本中生成渠道固化文件，产物重命名可以作为同一功能的后续小迭代；但 spec 中需要保留命名要求，避免渠道包人工分发时混淆。

### FR-9: 日志

主进程归因初始化需要记录关键生命周期日志：

- 当前渠道解析成功。
- 渠道值非法并回退到默认渠道。
- `firstKeyfrom` 首次写入。
- `latestKeyfrom` 更新。
- SQLite 读取或写入失败。

日志要求：

- 使用 `console.log` / `console.warn` / `console.error`。
- 日志必须以模块 tag 开头，例如 `[Keyfrom]`。
- 日志使用英文。
- 不在热循环中记录。
- 错误日志必须把 error 对象作为最后一个参数。

### FR-10: 开发测试能力

开发者应可以通过以下命令验证：

```bash
KEYFROM=bilibili npm run electron:dev:openclaw
KEYFROM=partner_a npm run electron:dev:openclaw
```

验证重点：

- 首次启动 `bilibili` 后，本地 `firstKeyfrom=bilibili`。
- 再用 `partner_a` 启动后，本地 `firstKeyfrom` 仍为 `bilibili`。
- 再用 `partner_a` 启动后，本地 `latestKeyfrom=partner_a`。
- 清理本地 kv 后，再用新渠道启动可重新初始化首次归因。

说明：

- `electron:dev:openclaw` 是日常本地开发入口，应直接支持 `KEYFROM` 环境变量。
- 开发模式读取运行时环境变量，是为了方便反复模拟不同渠道。
- 开发模式不会要求真实生成安装包，也不依赖生产包内的 `resources/keyfrom/keyfrom.json`。

## 4. 实现方案

### 4.1 共享常量与类型

建议新增：

```text
src/shared/keyfrom/constants.ts
src/shared/keyfrom/types.ts
```

常量示例：

```ts
export const DefaultKeyfrom = {
  Official: 'official',
} as const;

export const KeyfromStoreKey = {
  Attribution: 'keyfrom.attribution.v1',
} as const;
```

如果新增 IPC：

```ts
export const KeyfromIpc = {
  GetAttribution: 'keyfrom:getAttribution',
} as const;
```

要求：

- 所有比较、构造、kv key、IPC channel 都使用集中常量。
- 不在多个文件散落裸字符串。

### 4.2 keyfrom 解析服务

建议新增：

```text
src/main/libs/keyfromAttribution.ts
```

职责：

1. 解析当前启动渠道。
2. 校验并归一化渠道值。
3. 从 SQLite 读取已有归因。
4. 执行 `firstKeyfrom` / `latestKeyfrom` 更新规则。
5. 提供 `getKeyfromAttribution()` 给主进程其他模块复用。

核心方法建议：

```ts
normalizeKeyfrom(value: unknown): string
resolveCurrentKeyfrom(): string
initializeKeyfromAttribution(store: SqliteStore): KeyfromAttribution
readKeyfromAttribution(store: SqliteStore): KeyfromAttribution | null
saveKeyfromAttribution(store: SqliteStore, value: KeyfromAttribution): void
```

### 4.3 启动初始化时机

建议在主进程 SQLite store 初始化完成后、窗口创建前执行：

```text
SqliteStore.create()
  -> initializeKeyfromAttribution(store)
  -> create main window
```

理由：

- 归因属于应用级启动状态，不依赖 renderer。
- 后续登录、接口或埋点模块需要在主进程随时可读。
- 越早初始化，越不容易出现某些启动事件缺失渠道的情况。

### 4.4 构建期注入

建议新增脚本：

```text
scripts/generate-keyfrom-build-info.cjs
```

职责：

1. 读取 `process.env.KEYFROM`。
2. 使用与运行时一致的规则校验并归一化。
3. 写入构建期渠道文件。
4. 打印一行清晰日志说明当前打包渠道。

脚本需要接入：

- 开发模式：主进程直接读取 `KEYFROM`，覆盖构建期文件，便于本地调试。
- 打包模式：通过 `prebuild` 自动生成渠道固化文件；现有 `dist:mac:x64`、`dist:mac:arm64`、`dist:win` 不需要改成新的命令。
- `dist:*` / `pack` / `dist` 打包流程最终都应确保生成文件存在。

实现时需要避免改动过多 npm script。可以先让主进程开发模式直接读环境变量，生产打包路径再通过 `predist:*` 或统一 build 前置脚本生成文件。

当前推荐命令：

```bash
# 开发测试
KEYFROM=bilibili npm run electron:dev:openclaw

# macOS x64 渠道包
KEYFROM=bilibili npm run dist:mac:x64

# macOS arm64 渠道包
KEYFROM=bilibili npm run dist:mac:arm64

# Windows x64 渠道包
KEYFROM=bilibili npm run dist:win
```

构建脚本职责说明：

- 脚本不是新的启动/打包入口，只是 `npm run build` 的自动前置步骤。
- npm 会在执行 `npm run build` 时自动执行 `prebuild`。
- 脚本输出 `.keyfrom-build/keyfrom.json`。
- `electron-builder` 将 `.keyfrom-build/keyfrom.json` 打进安装包资源目录。
- App 正式运行时读取安装包资源目录中的渠道文件。
- `.keyfrom-build/keyfrom.json` 的典型内容：

```json
{
  "keyfrom": "bilibili",
  "generatedAt": "2026-05-15T08:04:48.717Z"
}
```

- 如果打包时没有传 `KEYFROM`，脚本输出 `keyfrom: "official"`。
- 生产包不直接读取用户机器上的 `process.env.KEYFROM`，也不读取当前工作目录下的 `.keyfrom-build`。

### 4.5 产物命名

如果第一版同步实现产物命名，建议优先利用 `electron-builder` 配置中的 artifact name 模板，或在打包后执行重命名脚本。

要求：

- 渠道名必须使用归一化后的 `keyfrom`。
- 不合法渠道不能进入文件名。
- 默认渠道也应体现在文件名中，便于和渠道包统一管理。

### 4.6 开发调试与清理

第一版可以不做 UI 重置入口。

开发者重测首次归因时，可以选择：

1. 删除应用 userData 目录下的 SQLite 数据库。
2. 使用 SQLite 工具删除 `keyfrom.attribution.v1` kv。
3. 后续新增仅开发可用 IPC 或菜单项清理该 kv。

如果新增清理能力，必须限制为开发模式或内部调试能力，不向普通生产用户暴露。

## 5. 边界情况

| 场景                                 | 处理方式                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| 开发启动未传 `KEYFROM`               | 使用 `official`                                                                       |
| 打包时未传 `KEYFROM`                 | 构建期固化 `official`，首次启动写入 `firstKeyfrom=official`、`latestKeyfrom=official` |
| `KEYFROM` 为空字符串                 | 使用 `official`                                                                       |
| `KEYFROM` 包含路径符号或特殊字符     | 回退 `official` 并记录 warning                                                        |
| 本地已有 `firstKeyfrom`              | 不覆盖                                                                                |
| 本地没有 `firstKeyfrom`              | 写入当前归一化后的渠道                                                                |
| 当前包渠道变化                       | 只更新 `latestKeyfrom`                                                                |
| 生产包所在 cwd 存在 `.keyfrom-build` | 忽略该目录，只读取安装包资源目录中的 `resources/keyfrom/keyfrom.json`                 |
| SQLite 读取失败                      | 记录 error，使用当前渠道作为内存兜底，不阻塞启动                                      |
| SQLite 写入失败                      | 记录 error，不阻塞启动                                                                |
| 旧版本没有归因 kv                    | 启动时自动按当前渠道初始化                                                            |
| 用户复制安装包给他人                 | 新设备首次启动按该包渠道初始化，属于渠道包归因的正常限制                              |
| 开发者想测试首次归因覆盖             | 需要先清理本地 kv 或 userData                                                         |

## 6. 涉及文件

预计新增：

- `src/shared/keyfrom/constants.ts`
- `src/shared/keyfrom/types.ts`
- `src/main/libs/keyfromAttribution.ts`
- `src/main/libs/keyfromAttribution.test.ts`
- `scripts/generate-keyfrom-build-info.cjs`

预计修改：

- `src/main/main.ts`
- `src/main/sqliteStore.ts` 或现有 kv 读写辅助方法所在文件
- `package.json`
- `electron-builder.json`
- `.gitignore`

可选修改：

- `src/main/preload.ts`
- `src/renderer/services/*`
- `src/renderer/types/*`

说明：可选修改仅用于开发调试读取，不属于本阶段必须范围。

## 7. 验收标准

1. `KEYFROM=bilibili npm run electron:dev:openclaw` 首次启动后，本地归因为 `firstKeyfrom=bilibili`、`latestKeyfrom=bilibili`。
2. 不清理本地数据，再运行 `KEYFROM=partner_a npm run electron:dev:openclaw` 后，`firstKeyfrom` 仍为 `bilibili`，`latestKeyfrom` 为 `partner_a`。
3. 清理归因 kv 后，再运行 `KEYFROM=partner_a npm run electron:dev:openclaw`，`firstKeyfrom` 变为 `partner_a`。
4. 未传 `KEYFROM` 时，当前渠道为 `official`。
5. 未传 `KEYFROM` 打包出的默认包首次启动后，SQLite 中保存 `firstKeyfrom=official`、`latestKeyfrom=official`。
6. 非法 `KEYFROM` 不会写入本地，归因回退为 `official`。
7. 应用重启后可以从 SQLite 读取已保存的归因结果。
8. 生产包运行时读取安装包资源目录中的 `resources/keyfrom/keyfrom.json`，不依赖用户机器运行时环境变量。
9. 单元测试覆盖 `normalizeKeyfrom()`、首次写入、不覆盖 `firstKeyfrom`、更新 `latestKeyfrom`、非法值回退。
10. 新增 IPC channel、kv key、默认渠道等字符串均通过集中常量定义。
11. 主进程日志符合 `[Keyfrom]` tag 和英文日志要求。
12. 本阶段没有修改登录、支付或 API 请求携带逻辑。
