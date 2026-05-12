# 语音输入权限拒绝处理设计文档

## 1. 概述

### 1.1 问题/背景

语音输入功能（PR #1947）在 macOS 上通过 AppleScript 模拟 `Fn+Fn` 触发系统听写，底层使用 `System Events`，需要辅助功能（Accessibility）权限。

首次点击时 macOS 弹出权限弹窗。如果用户拒绝：
- `osascript` 命令抛出错误（stderr 包含 `not allowed assistive access` 等）
- 但当前代码仅 `console.warn`，用户无任何可见反馈
- 后续再次点击依然静默失败，用户不知道发生了什么、也不知道如何修复

Windows 使用 `keybd_event` 模拟 Win+H，是标准 Win32 API，不需要额外权限，不存在此问题。

### 1.2 目标

- macOS 上权限被拒后，向用户显示清晰的提示信息，引导去系统设置开启权限
- 保持 Windows 行为不变

## 2. 用户场景

### 场景 1: macOS 首次使用，拒绝权限
**Given** 用户在 macOS 上首次点击语音输入按钮，系统弹出辅助功能权限弹窗
**When** 用户点击「拒绝」
**Then** 应用显示 toast 提示，引导用户前往 系统设置 → 隐私与安全性 → 辅助功能 中开启权限

### 场景 2: macOS 权限已拒，再次点击
**Given** 用户之前已拒绝辅助功能权限
**When** 用户再次点击语音输入按钮
**Then** 显示同样的 toast 提示

### 场景 3: macOS 权限已授予
**Given** 用户已在系统设置中授予辅助功能权限
**When** 用户点击语音输入按钮
**Then** 正常触发系统听写（行为与之前相同）

### 场景 4: Windows 不受影响
**Given** 用户在 Windows 上使用
**When** 用户点击语音输入按钮
**Then** 行为与之前完全相同，Win+H 正常触发

## 3. 功能需求

### FR-1: macOS 权限拒绝检测
- 主进程捕获 `osascript` 的 stderr 输出
- 根据关键词识别权限拒绝错误
- 返回结构化错误类型 `permission_denied`

### FR-2: 用户提示
- 前端收到 `permission_denied` 后，通过项目现有 toast 机制展示提示
- 提示内容包含具体的系统设置路径，方便用户操作

### FR-3: i18n
- 新增 `voiceInputPermissionDenied` 翻译键，支持中英文

## 4. 实现方案

### 4.1 主进程 — 权限拒绝检测

修改 `src/main/main.ts` 中 `voice:triggerDictation` handler 的 macOS 分支。参考已有 `checkCalendarPermission`（~L631）的 stderr 检测模式，在 `execAsync` 外层增加 try/catch，解析 stderr 关键词：

```typescript
} else if (process.platform === 'darwin') {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  try {
    await execAsync(`osascript -e 'tell application "System Events" to key code 63' -e 'delay 0.05' -e 'tell application "System Events" to key code 63'`);
    return { success: true };
  } catch (error: unknown) {
    const stderr = typeof error === 'object' && error && 'stderr' in error
      ? String((error as { stderr?: unknown }).stderr ?? '')
      : '';
    if (stderr.includes('not allowed assistive access') ||
        stderr.includes('assistive') ||
        stderr.includes('not authorized') ||
        stderr.includes('1002')) {
      return { success: false, error: 'permission_denied' };
    }
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
```

### 4.2 前端 hook — 返回结果

修改 `src/renderer/hooks/useSpeechToText.ts`，将返回类型从 `void` 改为 `{ success: boolean; error?: string }`，使调用方可以获取错误信息。

### 4.3 UI — toast 提示

修改 `src/renderer/components/cowork/CoworkPromptInput.tsx` 中 `handleVoiceInput`，改为 async 函数，检查返回结果并使用项目现有 `app:showToast` 事件展示提示。

### 4.4 i18n

在 `src/renderer/services/i18n.ts` 中新增翻译键。

## 5. 边界情况

| 场景 | 处理方式 |
|------|---------|
| macOS 权限拒绝 | 弹 toast 提示去系统设置 |
| macOS 权限已授予 | 正常触发听写 |
| Windows | 不受影响，行为不变 |
| osascript 因非权限原因失败 | 静默处理（console.warn），与之前一致 |

## 6. 涉及文件

| 操作 | 文件 |
|------|------|
| 修改 | `src/main/main.ts` |
| 修改 | `src/renderer/hooks/useSpeechToText.ts` |
| 修改 | `src/renderer/components/cowork/CoworkPromptInput.tsx` |
| 修改 | `src/renderer/services/i18n.ts` |

## 7. 验收标准

- [ ] macOS 拒绝辅助功能权限后，点击语音按钮弹出 toast 提示
- [ ] toast 内容包含系统设置路径引导
- [ ] macOS 授权后正常触发系统听写
- [ ] Windows 行为不受影响
- [ ] lint 检查通过
