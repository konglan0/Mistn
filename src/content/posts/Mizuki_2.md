---
title: 博客文章分享海报在长标题下底部内容被截断的修复与高度自适应修改
published: 2026-01-30
tags: [Mizuki]
category: 博客优化
draft: false
licenseName: "CC BY-NC-SA 4.0"
---

# 问题描述

在使用博客的文章分享海报组件（`ShareButton.svelte`）时，若文章标题较短（1行），海报生成正常。但当文章标题较长（2行及以上）时，生成的海报底部高度不足，导致底部的二维码被切掉一半，阴影效果也完全消失。

# 原因分析

经过排查 `generatePoster` 函数中的 Canvas 绘图逻辑，发现问题的根源在于**画布总高度的计算方式过于僵化**。

源代码中对于底部的预留高度使用了硬编码的常量：

```typescript
// 源代码逻辑
const footerHeight = 60 * SCALE; // 固定底部高度为 60
// ...
const canvasHeight = coverHeight + ... + footerHeight + PADDING;
```

然而，实际绘制的二维码尺寸定义为 `80 * SCALE`，且带有阴影。
当标题只有一行时，底部的 `PADDING` 碰巧吸收了二维码溢出的高度（80 - 60 = 20）。但当标题变长，文字行高累加导致整体布局下移，固定的 `canvasHeight` 无法容纳被推挤下来的内容，导致处于画布最底端的二维码被裁剪。

# 解决方案

修改 Canvas 的高度计算逻辑，摒弃固定的 `footerHeight`，转为**自适应累加计算**。不仅要精确计算文字块的高度，还要确保 Footer 区域的高度取“左侧文字信息”与“右侧二维码”中的最大值。

### 修改代码逻辑

在 `ShareButton.svelte`的`generatePoster` 函数中，找到以下代码块：
```typescript
		// Calculate layout
		const coverHeight = (coverImage ? 200 : 120) * SCALE;
		const titleFontSize = 24 * SCALE;
		const descFontSize = 14 * SCALE;
		const footerHeight = 60 * SCALE;

		ctx.font = `700 ${titleFontSize}px ${FONT_FAMILY}`;
		const titleLines = getLines(ctx, title, CONTENT_WIDTH);
		const titleLineHeight = 30 * SCALE;
		const titleHeight = titleLines.length * titleLineHeight;

		let descHeight = 0;
		if (description) {
			ctx.font = `${descFontSize}px ${FONT_FAMILY}`;
			const descLines = getLines(ctx, description, CONTENT_WIDTH - 16 * SCALE);
			descHeight = Math.min(descLines.length, 6) * (25 * SCALE);
		}

		const canvasHeight = coverHeight + PADDING + titleHeight + 16 * SCALE + descHeight +
			(description ? 24 * SCALE : 8 * SCALE) + 24 * SCALE + footerHeight + PADDING;

		canvas.width = WIDTH;
		canvas.height = canvasHeight;
```
将上面的代码完全删除，并在原位置粘贴以下代码：
```typescript
// 1. 基础尺寸定义
const coverHeight = (coverImage ? 200 : 120) * SCALE;
const titleFontSize = 24 * SCALE;
const titleLineHeight = 30 * SCALE;
const descFontSize = 14 * SCALE;
const descLineHeight = 25 * SCALE;

// 底部二维码尺寸
const qrSize = 80 * SCALE; 
const qrShadowSize = 4 * SCALE; // 预留阴影空间

// 2. 计算标题高度 (动态获取行数)
ctx.font = `700 ${titleFontSize}px ${FONT_FAMILY}`;
const titleLines = getLines(ctx, title, CONTENT_WIDTH);
const titleHeight = titleLines.length * titleLineHeight;

// 3. 计算描述高度
let descBlockHeight = 0; // 描述块的总高度
let descGap = 0;         // 标题和描述之间的间距

if (description) {
    ctx.font = `${descFontSize}px ${FONT_FAMILY}`;
    const descLines = getLines(ctx, description, CONTENT_WIDTH - 16 * SCALE);
    const lineCount = Math.min(descLines.length, 6);
    // 描述高度 = 行高总和 + 上下内边距修正
    descBlockHeight = (lineCount * descLineHeight) + (8 * SCALE); 
    descGap = 24 * SCALE; 
} else {
    descGap = 8 * SCALE;
}

// 4. 计算 Footer 自适应高度
const separatorHeight = 40 * SCALE; // 分割线上下间距总和 (24 + 16)

// Footer 内容高度：取 (左侧文字高度) 和 (右侧二维码+阴影高度) 的最大值
const footerLeftTextHeight = 60 * SCALE; 
const footerRightQrHeight = qrSize + qrShadowSize; 
const realFooterContentHeight = Math.max(footerLeftTextHeight, footerRightQrHeight);

// 5. 累加总高度
const canvasHeight = coverHeight + 
                    PADDING + 
                    titleHeight + 
                    (16 * SCALE) + // 标题行高修正
                    descGap + 
                    descBlockHeight + 
                    separatorHeight + 
                    realFooterContentHeight + 
                    PADDING;

canvas.width = WIDTH;
canvas.height = canvasHeight;
```
为了让后面的绘制逻辑使用刚刚计算好的变量，请在代码下方找到 `// Footer` 的绘制部分，删除重复定义的 `qrSize`:
```typescript
const footerY = drawY;
// const qrSize = 80 * SCALE; // 删除这行，直接使用上面计算布局时定义的 qrSize
```