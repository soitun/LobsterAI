---
name: minimax-image-understanding
description: >
  Analyze and understand images using MiniMax Vision Language Model (VLM).
  Use this skill when the user provides an image (URL or local file) and wants to understand, describe,
  or extract information from it. Supports JPEG, PNG, and WebP formats.
  Do NOT use this skill for image generation — only for image analysis/understanding.
official: true
version: 1.0.0
metadata:
  short-description: MiniMax 图片理解
---

# MiniMax 图片理解 (Image Understanding)

使用 MiniMax Vision Language Model (VLM) 分析和理解图片内容。支持从 URL 或本地文件读取图片，返回基于 prompt 的图片分析结果。

> **Node.js 版本**：此脚本使用 Node.js 实现，无需 Python 环境。通过入口脚本自动检测 Node.js 运行时（优先使用系统 node，回退到 LobsterAI 内置运行时），Windows 和 Mac 用户都可以开箱即用。

## 适用场景

- 用户提供了一张图片（URL 或本地文件），希望了解图片内容
- 需要描述、分析图片中的文字、物体、场景等
- OCR 文字识别
- UI 截图分析
- 图表/图形理解

**注意**：此 skill 仅用于图片**理解/分析**，不用于图片**生成**。

## 配置

### 方式一：使用 MiniMax 模型时自动生效（推荐）

当你在 LobsterAI 中选择 MiniMax 作为模型提供商时，已配置的 API Key 会自动注入为 `MINIMAX_API_KEY` 环境变量，无需额外配置。

### 方式二：通过 Skill .env 文件手动配置

如果你使用的是其他模型提供商（如 DeepSeek、GLM），但仍想使用 MiniMax 图片理解能力，可以在 skill 目录下创建 `.env` 文件：

```
# 文件位置: SKILLs/minimax-image-understanding/.env
MINIMAX_API_KEY=sk-api-your-key-here
MINIMAX_API_HOST=https://api.minimaxi.com
```

也可以通过 LobsterAI「技能」面板中的设置功能配置。

密钥以 `sk-api-` 或 `sk-cp-` 开头，可在 https://platform.minimaxi.com 获取。

### API Host（可选）

默认 `https://api.minimaxi.com`（中国大陆）。海外节点使用 `https://api.minimax.io`。

## 使用方法

### 基本用法 — 分析 URL 图片

```bash
bash "$SKILLS_ROOT/minimax-image-understanding/scripts/understand-image.sh" \
  --image "https://example.com/photo.png" \
  --prompt "请描述这张图片的内容"
```

### 分析本地文件

```bash
bash "$SKILLS_ROOT/minimax-image-understanding/scripts/understand-image.sh" \
  --image "/path/to/local/image.jpg" \
  --prompt "图片中有哪些文字？"
```

### 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--image`, `-i` | 是 | 图片来源：HTTP/HTTPS URL 或本地文件路径 |
| `--prompt`, `-p` | 是 | 对图片的分析请求/问题 |

### 支持的格式

- JPEG / JPG
- PNG
- WebP
- 最大 20MB

### 输出格式

成功时输出 JSON：
```json
{
  "success": true,
  "content": "图片分析结果文本..."
}
```

失败时输出：
```json
{
  "success": false,
  "error": "错误信息"
}
```

## 使用示例

### 描述图片内容

```bash
bash "$SKILLS_ROOT/minimax-image-understanding/scripts/understand-image.sh" \
  --image "screenshot.png" \
  --prompt "请详细描述这张截图的界面内容"
```

### OCR 文字识别

```bash
bash "$SKILLS_ROOT/minimax-image-understanding/scripts/understand-image.sh" \
  --image "document.jpg" \
  --prompt "请识别并提取图片中的所有文字"
```

### 图表分析

```bash
bash "$SKILLS_ROOT/minimax-image-understanding/scripts/understand-image.sh" \
  --image "chart.png" \
  --prompt "请分析这张图表的数据趋势和关键信息"
```

## API 说明

底层调用 MiniMax Coding Plan VLM 接口：

- **Endpoint**: `POST {API_HOST}/v1/coding_plan/vlm`
- **认证**: `Authorization: Bearer {MINIMAX_API_KEY}`
- **请求体**: `{ "prompt": "...", "image_url": "data:image/{fmt};base64,{data}" }`
- 图片会先下载（如果是 URL）并转为 base64 data URL 后发送
