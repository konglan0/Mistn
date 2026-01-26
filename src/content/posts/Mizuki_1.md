---
title: Mizuki 主题在子路径部署下初进首页不显示标题的细节问题、移动端首页大图暗部遮罩的删除
published: 2026-01-27
tags: [Mizuki]
category: 博客优化
draft: false
licenseName: "CC BY-NC-SA 4.0"
---

# 问题描述

在使用 Mizuki 主题搭建 Astro 博客时，如果将博客部署在子路径（例如 `https://example.com/Mistn/`），会遇到以下问题：

1.  **首屏加载异常**：用户首次访问首页或强制刷新时，移动端首屏加载无Banner 区域，PC端主标题不显示。
2.  **交互恢复**：在点击文章链接跳转并返回首页后，Banner 及特效能够正常显示。

# 原因分析

经过排查 `src/layouts/MainGridLayout.astro` 文件，发现该问题的根源在于**首页判断逻辑**不仅严苛且未考虑 Astro 的 `base` 配置。

源代码中通过以下逻辑判断当前页面是否为首页：

```javascript
// 源代码逻辑
const isHomePage = Astro.url.pathname === "/" || Astro.url.pathname === "";
```

当博客部署在根目录时，`Astro.url.pathname` 为 `/`，逻辑成立。
但当博客配置了 `base: "/Mistn"` 时，首页的 `pathname` 实际为 `/Mistn/`。由于 `/Mistn/` 不等于 `/`，导致 `isHomePage` 被判定为 `false`。

这一判定结果直接影响了后续的 CSS 类名生成：
*   `showHomeText` 变为 `false`，导致文字容器被添加 `hidden` 类。
*   `mobileNonHomeBannerClass` 生效，导致移动端 Banner 被隐藏。

# 解决方案

修改 `src/layouts/MainGridLayout.astro` 文件，引入 `import.meta.env.BASE_URL` 以动态获取配置的基础路径，并优化路径匹配逻辑。

### 修改前（Original Code）

```javascript
// 检查是否为首页
const isHomePage = Astro.url.pathname === "/" || Astro.url.pathname === "";
const showHomeText = siteConfig.banner.homeText?.enable && isHomePage;
// 手机端非首页不显示banner的CSS类
const mobileNonHomeBannerClass = !isHomePage ? "mobile-hide-banner" : "";
```

### 修改后（Modified Code）

```javascript
// 1. 获取当前路径和基础路径
const currentPath = Astro.url.pathname;
const base = import.meta.env.BASE_URL; // 自动读取 Astro 配置的 base 路径

// 2. 标准化路径函数：移除末尾斜杠，确保 "/Mistn" 与 "/Mistn/" 视为同一路径
const normalizePath = (path: string) => path.replace(/\/$/, "") || "/";

// 3. 修正后的首页判断逻辑
const isHomePage = 
    normalizePath(currentPath) === normalizePath(base) || 
    currentPath === "/" || 
    currentPath === "";

const showHomeText = siteConfig.banner.homeText?.enable && isHomePage;
// 手机端 CSS 类逻辑保持不变，依赖正确的 isHomePage 状态
const mobileNonHomeBannerClass = !isHomePage ? "mobile-hide-banner" : "";
```

# 结果验证

应用上述修改并重新构建（Build）后：
1.  `isHomePage` 能够正确识别子路径首页（如 `/Mistn/`）。
2.  `showHomeText` 状态正确，打字机特效容器移除 `hidden` 类，首屏即显示。
3.  `mobileNonHomeBannerClass` 为空，移动端 Banner 正常展开。

该修复方案兼容根目录部署与子目录部署，具有更好的鲁棒性。

# 补充优化

在移动端解决了初进首页的大图显示问题之后，可能还会存在大图的底部存在一个渐变暗色遮罩，导致图片下方及旁边的水波纹不够亮，与下方文章列表的白色背景形成明显的差别，导致不好的观感，解决方案如下：

在 `src/layouts/MainGridLayout.astro` 文件中搜索`/* 移动端暗色模式优化 */`，将下方代码：
```css
/* 移动端暗色模式优化 */
@media (max-width: 1279px) and (prefers-color-scheme: dark) {
    .banner-text-overlay {
        background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.8) 0%,
            rgba(0, 0, 0, 0.4) 50%,
            transparent 100%
        );
    }

    .banner-title {
        text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8);
    }

    .banner-subtitle {
        text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.7);
    }
}
```

修改为

```css
/* 移动端暗色模式优化 - 已移除所有背景遮罩 */
@media (max-width: 1279px) {
    .banner-text-overlay {
        background: none !important; /* 强制移除任何背景颜色或渐变 */
        background-image: none !important;
    }
    
    /* 强制提升水波纹层级，确保它永远在遮罩和图片之上，保持纯白 */
    /* 注意：这里使用了 :global 来确保样式能穿透应用到 waves 元素上 */
}

/* 这是一个全局修正，建议直接加在上面那个 media query 后面，或者单独放在 style 标签末尾 */
.waves {
    z-index: 25 !important; /* 原 Overlay 是 20，改为 25 即可压在上面 */
    position: absolute !important;
    bottom: -1px !important;
}

/* 如果你还需要保留暗色模式下的文字阴影（防止白字在白图上看不清），保留下面这段 */
@media (max-width: 1279px) and (prefers-color-scheme: dark) {
    .banner-title {
        text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8);
    }

    .banner-subtitle {
        text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.7);
    }
}
```

修改说明：
1.  `background: none !important;`: 彻底删除了那一层半透明的黑色渐变。
2.  `z-index: 25 !important;`: 不管以后是否有遮罩，把水波纹的层级从 5 提到了 25（超过了文字层的 20），水波纹现在会盖在所有横幅元素的最上面，保证它是纯白色的，与下方的页面背景完美衔接。


