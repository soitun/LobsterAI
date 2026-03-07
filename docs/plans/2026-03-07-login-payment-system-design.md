# LobsterAI 登录认证与付费体系设计

## 概述

为 LobsterAI Electron 桌面应用增加完整的用户体系：URS 手机号登录认证、套餐/积分付费、后端 API 代理调用大模型，以及管理后台进行套餐/定价配置。

## 决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 认证方式 | OAuth 授权码模式（URS） | 标准协议，安全性高 |
| 套餐模型 | 套餐 + 积分补充 | Lite/Pro 月套餐 + 单独积分包 |
| 支付场景 | 跳转外部 Web 商城 | 避免 Electron 内集成支付 SDK 的复杂性 |
| 大模型调用 | 后端 SSE 透传代理 | 保留流式体验，统一计费 |
| Java 后端 | Spring Boot + MySQL | 标准企业级技术栈 |
| 管理后台 | Vue3 + Element Plus | 国内后台管理常用方案 |

---

## 1. 系统架构

```
┌─────────────────┐      ┌──────────────────────┐      ┌──────────────────┐
│  LobsterAI      │      │  Java 后端            │      │  大模型 API      │
│  Electron 客户端 │◄────►│  Spring Boot + MySQL  │◄────►│  (OpenAI/Claude/ │
│                 │ HTTPS│                      │      │   DeepSeek 等)   │
└────────┬────────┘      └──────────┬───────────┘      └──────────────────┘
         │                         │
         │  OAuth                  │
         ▼                         ▼
┌─────────────────┐      ┌──────────────────────┐
│  系统浏览器      │      │  Vue3 管理后台        │
│  URS 登录页      │      │  Element Plus         │
└─────────────────┘      └──────────────────────┘
                                   │
                         ┌─────────┴──────────┐
                         │  Web 商城           │
                         │  (微信/支付宝支付)    │
                         └────────────────────┘
```

### 三个子系统

1. **Electron 客户端改造** — 登录按钮、认证流程、登录状态管理、API 代理调用
2. **Java 后端服务** — 用户管理、套餐/积分管理、API 代理透传、支付对接
3. **Vue3 管理后台** — 套餐配置、定价管理、用户管理、数据统计

---

## 2. 认证流程设计

### OAuth 授权码模式 + URS

```
用户点击登录
    │
    ▼
Electron 打开系统浏览器
    │  URL: https://urs.hz.netease.com/authorize
    │  参数: client_id, redirect_uri, response_type=code, scope
    │
    ▼
用户在 URS 完成手机号认证
    │
    ▼
URS 回调到 Java 后端
    │  GET /api/auth/callback?code=xxx
    │
    ▼
Java 后端用 code 换 access_token
    │  POST https://urs.hz.netease.com/token
    │
    ▼
Java 后端生成自有 JWT
    │  包含: userId, ursId, phone, exp
    │
    ▼
重定向到自定义 URL scheme
    │  lobsterai://auth/callback?token=xxx
    │
    ▼
Electron 通过 protocol handler 接收 token
    │
    ▼
客户端存储 token，更新登录状态
```

### 关键技术点

- **自定义协议**: 注册 `lobsterai://` URL scheme，Electron 通过 `app.setAsDefaultProtocolClient('lobsterai')` 注册
- **Token 管理**: JWT 双 token 机制（access_token 2h + refresh_token 30d）
- **安全**: PKCE 增强、state 参数防 CSRF

---

## 3. 客户端改造设计

### 3.1 UI 变更

**Sidebar 底部（Settings 按钮旁边）：**
- 未登录：显示「登录」按钮（用户图标）
- 已登录：显示用户头像/手机号末4位，点击展开用户菜单
  - 当前套餐信息（Lite/Pro/积分余额）
  - 充值入口（跳转 Web 商城）
  - 退出登录

### 3.2 新增模块

| 模块 | 文件 | 说明 |
|------|------|------|
| Redux Slice | `src/renderer/store/slices/authSlice.ts` | 用户登录状态、套餐信息、积分余额 |
| Auth Service | `src/renderer/services/auth.ts` | 登录/登出/Token 刷新/状态查询 |
| IPC Handlers | `src/main/main.ts` 新增 `auth:*` 通道 | 协议处理、Token 存储 |
| Preload API | `src/main/preload.ts` 新增 `auth` 命名空间 | 暴露 auth API 给渲染进程 |
| 登录按钮组件 | `src/renderer/components/LoginButton.tsx` | Sidebar 底部登录/用户信息 |
| 用户菜单组件 | `src/renderer/components/UserMenu.tsx` | 登录后的下拉菜单 |

### 3.3 API 代理模式

用户登录并有有效套餐后，客户端切换到「代理模式」：

```
当前模式: 用户自己配置 API key → 直连大模型 API
代理模式: 客户端带 JWT → Java 后端代理 → 大模型 API（SSE 透传）
```

- 代理模式和自配 API key 模式共存
- 已登录且有套餐用户默认使用代理模式
- 用户也可以自行配置 API key 使用直连模式

### 3.4 IPC 通道设计

```typescript
// 认证相关
'auth:login'          // 打开系统浏览器进行 URS 登录
'auth:logout'         // 退出登录
'auth:getUser'        // 获取当前用户信息
'auth:refreshToken'   // 刷新 access_token
'auth:onCallback'     // 监听协议回调

// 用户信息相关
'user:getQuota'       // 获取套餐/积分余额
'user:openRecharge'   // 打开 Web 商城充值页
```

---

## 4. Java 后端设计

### 4.1 技术栈

- Spring Boot 3.x + Java 17
- MySQL 8.0
- Redis（Token 缓存、限流）
- Spring Security（JWT 认证）

### 4.2 服务模块

```
lobsterai-server/
├── auth-module/          # 认证模块
│   ├── URS OAuth 对接
│   ├── JWT 生成/验证
│   └── 自定义协议回调
├── user-module/          # 用户模块
│   ├── 用户 CRUD
│   ├── 套餐订阅管理
│   └── 积分管理
├── billing-module/       # 计费模块
│   ├── API 调用计费
│   ├── 套餐额度检查
│   └── 积分扣减
├── proxy-module/         # API 代理模块
│   ├── SSE 透传代理
│   ├── 多模型路由
│   └── 请求/响应日志
├── payment-module/       # 支付模块
│   ├── 微信支付对接
│   ├── 支付宝支付对接
│   └── 订单管理
└── admin-module/         # 管理接口
    ├── 套餐 CRUD
    ├── 定价策略配置
    └── 用户/订单查询
```

### 4.3 核心数据模型

```sql
-- 用户表
CREATE TABLE users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    urs_id VARCHAR(64) UNIQUE NOT NULL,
    phone VARCHAR(20),
    nickname VARCHAR(64),
    avatar_url VARCHAR(256),
    status TINYINT DEFAULT 1,        -- 1:正常 0:禁用
    created_at DATETIME,
    updated_at DATETIME
);

-- 套餐定义表
CREATE TABLE plans (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(32) NOT NULL,       -- lite / pro
    display_name VARCHAR(64),
    price_monthly DECIMAL(10,2),     -- 月付价格
    price_yearly DECIMAL(10,2),      -- 年付价格
    quota_tokens BIGINT,             -- 月 token 额度
    allowed_models JSON,             -- 允许使用的模型列表
    max_context_length INT,          -- 最大上下文长度
    status TINYINT DEFAULT 1,
    created_at DATETIME,
    updated_at DATETIME
);

-- 用户订阅表
CREATE TABLE subscriptions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    plan_id BIGINT NOT NULL,
    start_date DATE,
    end_date DATE,
    status TINYINT,                  -- 1:有效 2:过期 3:取消
    auto_renew BOOLEAN DEFAULT TRUE,
    created_at DATETIME,
    updated_at DATETIME
);

-- 积分表
CREATE TABLE credits (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    balance BIGINT DEFAULT 0,        -- 当前积分余额
    updated_at DATETIME
);

-- 积分流水表
CREATE TABLE credit_transactions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    amount BIGINT,                   -- 正数充值，负数消费
    type VARCHAR(20),                -- recharge / consume / refund
    description VARCHAR(256),
    order_id VARCHAR(64),
    created_at DATETIME
);

-- 订单表
CREATE TABLE orders (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_no VARCHAR(64) UNIQUE,
    user_id BIGINT NOT NULL,
    product_type VARCHAR(20),        -- plan / credits
    product_id BIGINT,
    amount DECIMAL(10,2),
    pay_channel VARCHAR(20),         -- wechat / alipay
    pay_status TINYINT,              -- 0:待支付 1:已支付 2:已退款
    paid_at DATETIME,
    created_at DATETIME
);

-- API 调用日志表
CREATE TABLE api_call_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    model VARCHAR(64),
    input_tokens INT,
    output_tokens INT,
    cost_credits BIGINT,             -- 消耗积分
    session_id VARCHAR(64),
    created_at DATETIME
);
```

### 4.4 SSE 透传代理

```
客户端请求:
POST /api/proxy/chat/completions
Headers: Authorization: Bearer <jwt_token>
Body: { model, messages, stream: true }

后端处理:
1. JWT 验证 → 获取 userId
2. 检查套餐/积分余额
3. 根据 model 路由到对应大模型 API
4. SSE 透传响应给客户端
5. 流结束后统计 token 用量，扣减额度/积分
```

### 4.5 核心 API

```
# 认证
GET  /api/auth/login           # 生成 URS 授权 URL
GET  /api/auth/callback        # URS 回调，换 token
POST /api/auth/refresh         # 刷新 access_token
POST /api/auth/logout          # 退出登录

# 用户
GET  /api/user/profile         # 用户信息
GET  /api/user/quota           # 套餐/积分余额

# 代理
POST /api/proxy/chat/completions  # SSE 代理调用大模型

# 支付
GET  /api/plans                # 可购买套餐列表
POST /api/orders/create        # 创建订单
POST /api/orders/pay/wechat    # 微信支付
POST /api/orders/pay/alipay    # 支付宝支付
POST /api/webhook/wechat       # 微信支付回调
POST /api/webhook/alipay       # 支付宝支付回调

# 管理后台 API（需管理员权限）
CRUD /api/admin/plans          # 套餐管理
CRUD /api/admin/credits-packs  # 积分包管理
GET  /api/admin/users          # 用户列表
GET  /api/admin/orders         # 订单列表
GET  /api/admin/stats          # 统计数据
```

---

## 5. 管理后台设计

### 5.1 技术栈

- Vue 3 + TypeScript
- Element Plus
- Pinia 状态管理
- Vue Router
- Axios

### 5.2 功能模块

```
管理后台/
├── 首页仪表盘
│   ├── 用户总数/新增
│   ├── 订单数量/收入
│   ├── API 调用量
│   └── 活跃用户趋势
├── 套餐管理
│   ├── 套餐列表（Lite/Pro/自定义）
│   ├── 新增/编辑套餐
│   │   ├── 名称、价格（月付/年付）
│   │   ├── Token 月额度
│   │   ├── 允许的模型列表
│   │   └── 上下架状态
│   └── 积分包管理
│       ├── 积分包列表（100积分/$5 等）
│       └── 新增/编辑积分包
├── 用户管理
│   ├── 用户列表（搜索/筛选）
│   ├── 用户详情（套餐、积分、调用记录）
│   └── 禁用/启用用户
├── 订单管理
│   ├── 订单列表
│   ├── 订单详情
│   └── 退款处理
├── API 调用统计
│   ├── 调用量趋势
│   ├── 模型用量分布
│   └── 成本分析
└── 系统配置
    ├── 模型定价配置（每模型每千 token 消耗积分数）
    ├── 支付渠道配置
    └── 全局参数
```

### 5.3 定价策略配置

管理后台可配置：
- 各模型的积分单价（每千 input/output token 消耗多少积分）
- 套餐月额度（token 数量）
- 积分包面额和售价
- 优惠活动（限时折扣等）

---

## 6. 套餐与计费模型

### 6.1 套餐设计

| 套餐 | 月价 | 月 Token 额度 | 可用模型 |
|------|------|--------------|---------|
| Lite | ¥29 | 100万 tokens | GPT-4o-mini, DeepSeek, Qwen |
| Pro  | ¥99 | 500万 tokens | 全部模型含 Claude, GPT-4o |

### 6.2 积分机制

- 套餐内额度用完后自动扣积分
- 积分可单独购买（如 ¥10 = 1000积分）
- 不同模型消耗不同积分（按 token 计费，管理后台可配置）

### 6.3 计费流程

```
API 请求到达
    │
    ▼
检查用户套餐状态
    │
    ├── 有效套餐且额度未超 → 扣减套餐额度 → 允许调用
    │
    ├── 套餐额度已满 → 检查积分余额
    │   ├── 积分足够 → 扣减积分 → 允许调用
    │   └── 积分不足 → 返回 402 余额不足
    │
    └── 无套餐 → 检查积分余额
        ├── 积分足够 → 扣减积分 → 允许调用
        └── 积分不足 → 返回 402 余额不足
```

---

## 7. 安全设计

- **JWT**: RS256 签名，access_token 2小时过期
- **PKCE**: OAuth 认证增加 code_verifier/code_challenge
- **HTTPS**: 全链路 TLS 加密
- **API 限流**: 基于用户的 rate limiting（Redis 令牌桶）
- **敏感数据**: API key 服务端存储，不下发客户端
- **CSRF**: OAuth state 参数校验
- **XSS**: 客户端输入过滤，CSP 策略

---

## 8. 项目结构

```
项目整体/
├── LobsterAI/                    # 现有 Electron 客户端（改造）
├── lobsterai-server/             # Java 后端（新建）
│   └── Spring Boot 单体应用
└── lobsterai-admin/              # Vue3 管理后台（新建）
    └── Vue3 + Element Plus
```
