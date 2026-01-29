---
title: win系统下DeepSeek-OCR2部署与使用
published: 2026-01-30
tags: [DeepSeek-OCR2]
category: 开源部署
image: "./9.webp"
draft: false
licenseName: "CC BY-NC-SA 4.0"
---
# 模型下载
## 设置魔塔社区（ModelScope）下载路径
配置环境变量，将魔塔社区保存模型的路径从默认的C盘调整至D盘。按照如下步骤进行：
- 在 Windows 搜索栏输入“编辑系统环境变量”，点击“环境变量”按钮。
- 在“用户变量”或“系统变量”区域，点击“新建”。
    - 变量名: `MODELSCOPE_CACHE`
    - 变量值: `D:\ModelScope_Cache` (或者是你想要存放模型的 D 盘具体路径)
    - 保存并重启你的终端（CMD/PowerShell）或 所有的IDE（VS Code/PyCharm）
- 新建文件夹ModelScope_Cache与deepseek-OCR2，在deepseek-OCR2文件夹内打开VS code（IDE）
## 下载模型权重
在VS code中新建默认终端，创建新环境：
```base
conda create -n dsocr2 python=3.12.9 -y
conda activate dsocr2
```
激活环境后，安装魔塔社区包并下载模型权重：
```dsocr2
pip install modelscope
modelscope download --model deepseek-ai/DeepSeek-OCR-2
```
## 下载模型源码
使用git克隆源码并进入项目文件夹：
```dsocr2
git clone https://github.com/deepseek-ai/DeepSeek-OCR-2.git
cd DeepSeek-OCR-2
```
依次安装必备包：
```dsocr2
pip install torch==2.6.0 torchvision==0.21.0 torchaudio==2.6.0 =2.6.0 --index-url https://download.pytorch.org/whl/cu118
pip install -r requirements.txt

```
:::note[模型存放D盘的相关导入注意事项]
**1.情况一：使用 ModelScope 官方 SDK 加载（最省事）**

如果你在代码中使用 `snapshot_download` 或 `AutoModel` 来加载模型，只要你设置了环境变量 `MODELSCOPE_CACHE`，代码会自动去新路径找模型，不需要改代码。
```python
import os
# 如果你没有在系统层面设置环境变量，可以在代码最开头手动指定
# os.environ['MODELSCOPE_CACHE'] = 'D:\\ModelScope_Cache' 

from modelscope import snapshot_download
# 这行代码会自动去 D:\ModelScope_Cache 查找，找不到才会下载
model_dir = snapshot_download('deepseek-ai/DeepSeek-OCR-2') 
```
**2.情况二：手动指定绝对路径**

如果你不想依赖环境变量，你需要知道模型下载后的具体文件夹路径，并在代码中显式指定：
```python
# 假设你下载到了 D:\ModelScope_Cache\hub\models\deepseek-ai\DeepSeek-OCR-2
model_path = r"D:\ModelScope_Cache\hub\models\deepseek-ai\DeepSeek-OCR-2"

# 加载时直接传路径
model = AutoModel.from_pretrained(model_path, ...)
```
注意事项：

1.**路径分隔符**: 在 Windows 上写路径字符串时，建议在字符串前加 `r`（如 `r"D:\Models"`）或者使用双反斜杠 `\\`，防止转义字符报错。

2.**HuggingFace 兼容性**: 如果你不是用 modelscope 的库，而是用 `transformers` 库加载这个下载好的模型，你需要确保传入的是包含 `config.json` 和 `.bin/.safetensors` 文件的最终目录路径。

强烈建议设置永久环境变量 `MODELSCOPE_CACHE` 到 D 盘，这样既能节省 C 盘空间，又能在后续使用中保持代码简洁（不需要每次都手动改路径）。
:::
# 模型使用
## 文件夹创建

在源码根目录下创建文件夹：`img_input`、`img_output`、`pdf_input`、`pdf_output`，分别用于存放文件

## pdf转md

win系统下使用deepseek-ocr2我们无法安装`vllm`和`flash-attn`，故需要针对**pdf转md**进行修改，我们可以选择类似图片转md的基于`transformers`的纯原生方案,虽然推理速度比 vLLM 稍慢，但胜在Windows 兼容性完美，且不需要复杂的编译环境。

首先，我们在`DeepSeek-OCR2-hf`文件夹中创建`run_dpsk_ocr2_pdf.py`文件，内容如下：
```python
import os
import io
import fitz  # PyMuPDF
import torch
import sys
import contextlib
import re
from PIL import Image
from transformers import AutoModel, AutoTokenizer

# ================= 配置区域 =================
PDF_PATH = r' '#此处填入pdf_input下的pdf路径，推荐使用绝对路径，路径内容必须以.pdf结尾,例如：例如：D：...\pdf_output\2500836.pdf
MODEL_PATH = r'D:\ModelScope_Cache\models\deepseek-ai\DeepSeek-OCR-2'#此处填入你的模型权重所在路径
OUTPUT_MD_PATH = r' '#此处填入pdf_output下的md路径，推荐使用绝对路径，路径内容必须以.md结尾，即在此需填入目录下的md文件，但不必真有此文件，转换后会自动创建，但是最后的路径结尾不能是文件夹！例如：D：...\pdf_output\A2500836.md
# ===========================================

def clean_ocr_output(text):
    """
    清洗器：专门去除模型输出中的垃圾日志
    """
    lines = text.split('\n')
    clean_lines = []
    
    # 定义垃圾日志的特征关键词
    junk_keywords = [
        "The attention mask", "Setting `pad_token_id`", "The `seen_tokens` attribute",
        "BASE:  torch.Size", "PATCHES:  torch.Size", "UserWarning:", 
        "configuration_utils.py", "modeling_deepseekocr2.py", "warnings.warn",
        "Loading checkpoint", "input_ids", "attention_mask", "position_ids",
        "Using `bitsandbytes`", "was not set", "cannot be inferred",
        "Using the slow distutils backend", "get_max_cache", "transitioning from computing"
    ]

    for line in lines:
        is_junk = False
        # 1. 检查是否包含垃圾关键词
        for kw in junk_keywords:
            if kw in line:
                is_junk = True
                break
        
        # 2. 检查是否是纯粹的进度条或分割线（如果不是Markdown的一部分）
        if line.strip().startswith("=====") and "torch.Size" not in line:
             # 有些分割线可能是日志的，有些是文档的，这里保守处理
             pass 

        if not is_junk:
            clean_lines.append(line)
            
    # 重新组合文本
    result = '\n'.join(clean_lines)
    
    # 3. 去除首尾多余空行
    result = result.strip()
    return result

def load_pdf_as_images(pdf_path, dpi=144):
    print(f"[1/3] Loading PDF: {pdf_path}")
    images = []
    try:
        pdf_document = fitz.open(pdf_path)
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        for page_num in range(pdf_document.page_count):
            page = pdf_document[page_num]
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB")
            images.append(img)
        pdf_document.close()
        return images
    except Exception as e:
        print(f"Error: {e}")
        return []

def main():
    os.environ["CUDA_VISIBLE_DEVICES"] = '0'
    
    print(f"[2/3] Loading Model...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
    try:
        model = AutoModel.from_pretrained(MODEL_PATH, trust_remote_code=True, _attn_implementation='flash_attention_2')
    except:
        model = AutoModel.from_pretrained(MODEL_PATH, trust_remote_code=True)

    model = model.eval().cuda().to(torch.bfloat16)
    
    images = load_pdf_as_images(PDF_PATH)
    if not images: return

    full_markdown_content = ""
    print(f"[3/3] Start Recognition ({len(images)} pages)...")
    
    prompt = "<image>\nFree OCR."

    # 确保输出目录存在
    os.makedirs(os.path.dirname(OUTPUT_MD_PATH), exist_ok=True)

    for i, img in enumerate(images):
        print(f"Processing Page {i+1}/{len(images)}...", end="")
        
        temp_img_path = f"temp_page_{i}.png"
        img.save(temp_img_path)
        
        captured_output = io.StringIO()
        
        try:
            # 捕获输出
            with contextlib.redirect_stdout(captured_output):
                # 同时也捕获 stderr 防止警告漏网
                with contextlib.redirect_stderr(captured_output):
                    model.infer(
                        tokenizer, 
                        prompt=prompt, 
                        image_file=temp_img_path, 
                        output_path="./temp_output", # 这个路径不重要
                        base_size=1024, 
                        image_size=768, 
                        crop_mode=True, 
                        save_results=False
                    )
            
            # 获取原始杂乱文本
            raw_text = captured_output.getvalue()
            
            # === 核心步骤：清洗文本 ===
            clean_text = clean_ocr_output(raw_text)
            
            # 拼接到结果
            if clean_text:
                full_markdown_content += f"\n\n<!-- Page {i+1} -->\n\n" + clean_text
                print(f" Done. (Len: {len(clean_text)})")
            else:
                print(f" Warning: No content.")

        except Exception as e:
            print(f" Error: {e}")
        finally:
            captured_output.close()
            if os.path.exists(temp_img_path):
                try: os.remove(temp_img_path) 
                except: pass

    # 最终保存
    with open(OUTPUT_MD_PATH, "w", encoding="utf-8") as f:
        f.write(full_markdown_content)
    
    print(f"\nSaved clean markdown to: {OUTPUT_MD_PATH}")

if __name__ == "__main__":
    main()
```
修改上述代码中的`PDF_PATH`、`MODEL_PATH`和`OUTPUT_MD_PATH`后并运行即可得到转换结果。注意，**`OUTPUT_MD_PATH`必须以md为结尾，不能以文件夹结尾，例如`D：...\pdf_output\A2500836.md`，但你不必提前创建此文件**

若你想批量一次性处理完`pdf_input`下的所有pdf并转为对应名称的md文档，可以使用下面的代码：
```python
import os
import io
import fitz  # PyMuPDF
import torch
import sys
import contextlib
import time
from PIL import Image
from transformers import AutoModel, AutoTokenizer

# ================= 核心配置区域 =================

# 1. 输入文件夹 (存放所有 PDF 的目录)
INPUT_DIR = r'D:\..\deepseek-ocr2\DeepSeek-OCR-2\pdf_input'#此处为示例，请修改为你的路径

# 2. 输出文件夹 (存放生成 MD 的目录)
OUTPUT_DIR = r'D:\..\deepseek-ocr2\DeepSeek-OCR-2\pdf_output'#此处为示例，请修改为你的路径

# 3. 模型路径
MODEL_PATH = r'D:\ModelScope_Cache\models\deepseek-ai\DeepSeek-OCR-2'#此处为示例，请修改为你的路径

# ===============================================

def clean_ocr_output(text):
    """ 清洗器：去除模型输出中的垃圾日志 """
    lines = text.split('\n')
    clean_lines = []
    # 定义垃圾日志特征
    junk_keywords = [
        "The attention mask", "Setting `pad_token_id`", "The `seen_tokens` attribute",
        "BASE:  torch.Size", "PATCHES:  torch.Size", "UserWarning:", 
        "configuration_utils.py", "modeling_deepseekocr2.py", "warnings.warn",
        "Loading checkpoint", "input_ids", "attention_mask", "position_ids",
        "Using `bitsandbytes`", "was not set", "cannot be inferred",
        "Using the slow distutils backend", "get_max_cache", "transitioning from computing"
    ]

    for line in lines:
        is_junk = False
        for kw in junk_keywords:
            if kw in line:
                is_junk = True
                break
        if not is_junk:
            clean_lines.append(line)
            
    return '\n'.join(clean_lines).strip()

def load_pdf_as_images(pdf_path, dpi=144):
    images = []
    try:
        pdf_document = fitz.open(pdf_path)
        zoom = dpi / 72.0
        matrix = fitz.Matrix(zoom, zoom)
        for page_num in range(pdf_document.page_count):
            page = pdf_document[page_num]
            pixmap = page.get_pixmap(matrix=matrix, alpha=False)
            img = Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB")
            images.append(img)
        pdf_document.close()
        return images
    except Exception as e:
        print(f"Error loading PDF {pdf_path}: {e}")
        return []

def process_one_pdf(pdf_path, model, tokenizer):
    """ 处理单个 PDF 文件的核心逻辑 """
    
    # 1. 生成输出文件名
    file_name = os.path.basename(pdf_path) # 例如: 2500836.pdf
    file_base_name = os.path.splitext(file_name)[0] # 例如: 2500836
    output_md_path = os.path.join(OUTPUT_DIR, f"{file_base_name}.md")
    
    # 检查是否已存在，避免重复跑 (可选)
    # if os.path.exists(output_md_path):
    #     print(f"   [跳过] 文件已存在: {file_name}")
    #     return

    print(f"\n📄 正在处理: {file_name} -> {file_base_name}.md")
    
    # 2. 转图片
    images = load_pdf_as_images(pdf_path)
    if not images:
        print("   [错误] PDF加载失败或为空。")
        return

    full_content = f"# {file_base_name}\n\n"
    prompt = "<image>\nFree OCR."
    
    # 3. 逐页识别
    start_time = time.time()
    for i, img in enumerate(images):
        print(f"   - Page {i+1}/{len(images)} ... ", end="", flush=True)
        
        temp_img_path = f"temp_{file_base_name}_{i}.png"
        img.save(temp_img_path)
        
        captured_output = io.StringIO()
        try:
            with contextlib.redirect_stdout(captured_output):
                with contextlib.redirect_stderr(captured_output):
                    model.infer(
                        tokenizer, 
                        prompt=prompt, 
                        image_file=temp_img_path, 
                        output_path="./temp_dummy", 
                        base_size=1024, 
                        image_size=768, 
                        crop_mode=True, 
                        save_results=False
                    )
            
            raw_text = captured_output.getvalue()
            clean_text = clean_ocr_output(raw_text)
            
            if clean_text:
                full_content += f"\n\n<!-- Page {i+1} -->\n\n" + clean_text
                print(f"OK ({len(clean_text)} chars)")
            else:
                print("Warning (Empty)")
                
        except Exception as e:
            print(f"Error: {e}")
        finally:
            captured_output.close()
            if os.path.exists(temp_img_path):
                try: os.remove(temp_img_path)
                except: pass

    # 4. 保存结果
    try:
        with open(output_md_path, "w", encoding="utf-8") as f:
            f.write(full_content)
        elapsed = time.time() - start_time
        print(f"   ✅ 完成！耗时: {elapsed:.1f}s, 保存至: {output_md_path}")
    except Exception as e:
        print(f"   ❌ 保存失败: {e}")

def main():
    # 0. 初始化
    os.environ["CUDA_VISIBLE_DEVICES"] = '0'
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("🤖 [1/3] 正在加载模型 (DeepSeek-OCR2)...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
    try:
        model = AutoModel.from_pretrained(MODEL_PATH, trust_remote_code=True, _attn_implementation='flash_attention_2')
        print("   -> Flash Attention: ON (加速模式)")
    except:
        model = AutoModel.from_pretrained(MODEL_PATH, trust_remote_code=True)
        print("   -> Flash Attention: OFF (普通模式)")

    model = model.eval().cuda().to(torch.bfloat16)

    # 1. 扫描文件
    print(f"\n📂 [2/3] 扫描输入目录: {INPUT_DIR}")
    pdf_files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith('.pdf')]
    
    if not pdf_files:
        print("   没有找到 PDF 文件！请检查路径。")
        return
    
    print(f"   找到 {len(pdf_files)} 个 PDF 文件，准备开始处理。")

    # 2. 批量循环
    print("\n🚀 [3/3] 开始批量转换任务...")
    for idx, pdf_file in enumerate(pdf_files):
        print(f"\n[{idx+1}/{len(pdf_files)}] 任务启动 --------------------------")
        pdf_full_path = os.path.join(INPUT_DIR, pdf_file)
        process_one_pdf(pdf_full_path, model, tokenizer)
        
    print("\n🎉 所有任务全部完成！")

if __name__ == "__main__":
    main()
```
>tips:请确保你的 `INPUT_DIR` 路径里真的有 PDF 文件。

## 图片转md
打开`DeepSeek-OCR2-hf`下的`run_dpsk_ocr2.py`,在`model_name`、`image_file`、`output_path`下填入你具体的路径，注意使用`r`转义，此`output_path`以文件夹`img_output`结尾即可。若你想批量处理`img_input`下的图片，可参考下面的代码，提供了一对一md和合并md的版本：
```python
import os
import io
import torch
import sys
import contextlib
import time
from transformers import AutoModel, AutoTokenizer

# ================= 核心配置区域 =================

# 1. 输入文件夹 (存放图片的目录)
INPUT_DIR = r'D:\..\deepseek-ocr2\DeepSeek-OCR-2\img_input' #此处为示例，请修改为你的路径

# 2. 输出文件夹 (存放生成 MD 的目录)
OUTPUT_DIR = r'D:\..\deepseek-ocr2\DeepSeek-OCR-2\img_output' #此处为示例，请修改为你的路径

# 3. 模型路径
MODEL_PATH = r'D:\ModelScope_Cache\models\deepseek-ai\DeepSeek-OCR-2'#此处为示例，请修改为你的路径

# 4. 提示词
PROMPT = "<image>\n<|grounding|>Convert the document to markdown."

# ===============================================

def clean_ocr_output(text):
    """ 清洗器：去除垃圾日志 """
    lines = text.split('\n')
    clean_lines = []
    junk_keywords = [
        "The attention mask", "Setting `pad_token_id`", "The `seen_tokens` attribute",
        "BASE:  torch.Size", "PATCHES:  torch.Size", "UserWarning:", 
        "configuration_utils.py", "modeling_deepseekocr2.py", "warnings.warn",
        "Loading checkpoint", "input_ids", "attention_mask", "position_ids",
        "get_max_cache", "transitioning from computing"
    ]
    for line in lines:
        if not any(kw in line for kw in junk_keywords):
            clean_lines.append(line)
    return '\n'.join(clean_lines).strip()

def process_batch_images(model, tokenizer):
    """ 批量处理图片并分别保存
        自动读取 INPUT_DIR 下的 .jpg, .png 等格式的图片
        如果输入是 img_01.png，它会自动保存为 img_01.md
    """
    
    # 支持的图片格式
    valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tiff')
    
    # 扫描文件
    image_files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith(valid_extensions)]
    # 按文件名排序，保证处理顺序
    image_files.sort() 
    
    if not image_files:
        print(f"❌ 在 {INPUT_DIR} 未找到图片文件。")
        return

    print(f"🚀 找到 {len(image_files)} 张图片，开始批量处理...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for idx, img_name in enumerate(image_files):
        img_path = os.path.join(INPUT_DIR, img_name)
        file_base_name = os.path.splitext(img_name)[0]
        output_md_path = os.path.join(OUTPUT_DIR, f"{file_base_name}.md")
        
        print(f"[{idx+1}/{len(image_files)}] 处理: {img_name} ... ", end="", flush=True)

        captured_output = io.StringIO()
        try:
            # 核心：拦截控制台输出
            with contextlib.redirect_stdout(captured_output):
                with contextlib.redirect_stderr(captured_output):
                    model.infer(
                        tokenizer, 
                        prompt=PROMPT, 
                        image_file=img_path, 
                        output_path="./temp_dummy", # 这里的路径不重要
                        base_size=1024, 
                        image_size=768, 
                        crop_mode=True, 
                        save_results=False
                    )
            
            # 清洗数据
            raw_text = captured_output.getvalue()
            clean_text = clean_ocr_output(raw_text)
            
            # 保存单个MD
            if clean_text:
                with open(output_md_path, "w", encoding="utf-8") as f:
                    f.write(clean_text)
                print(f"✅ 已保存 -> {file_base_name}.md")
            else:
                print("⚠️ 内容为空，跳过保存。")
                
        except Exception as e:
            print(f"❌ 失败: {e}")
        finally:
            captured_output.close()

def merge_markdown_files(merged_file_name="merged_result.md"):
    """ 
    合并接口：将 OUTPUT_DIR 下的所有 .md 文件合并为一个 
    尝试根据文件名里的数字进行排序。例如，它能正确地把 page_2.md 排在 page_10.md 前面。
    合并后的文件会保存在 OUTPUT_DIR 下，名字叫 all_images_merged.md（你可以在 main 函数里改名）。
    """
    print(f"\n🔗 正在合并所有 Markdown 文件...")
    
    # 获取所有md文件并排序
    md_files = [f for f in os.listdir(OUTPUT_DIR) if f.lower().endswith('.md')]
    # 过滤掉可能存在的合并结果文件本身，防止递归
    md_files = [f for f in md_files if f != merged_file_name]
    
    # 智能排序：尝试按数字顺序排序 (比如 1.md, 2.md, 10.md)，而不是默认的字符顺序 (1.md, 10.md, 2.md)
    try:
        md_files.sort(key=lambda x: int(''.join(filter(str.isdigit, x))) if any(char.isdigit() for char in x) else x)
    except:
        md_files.sort() # 如果文件名不含数字，回退到默认排序

    if not md_files:
        print("⚠️ 没有找到可合并的 MD 文件。")
        return

    merged_path = os.path.join(OUTPUT_DIR, merged_file_name)
    
    with open(merged_path, 'w', encoding='utf-8') as outfile:
        outfile.write(f"# Merged Document\n\nGenerated on {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        
        for md_file in md_files:
            file_path = os.path.join(OUTPUT_DIR, md_file)
            with open(file_path, 'r', encoding='utf-8') as infile:
                content = infile.read()
                
                # 添加文件分割标识
                outfile.write(f"\n\n--- Source: {md_file} ---\n\n")
                outfile.write(content)
    
    print(f"🎉 合并完成！总文件已保存至:\n{merged_path}")

def main():
    # 0. 环境设置
    os.environ["CUDA_VISIBLE_DEVICES"] = '0'
    
    # 1. 加载模型
    print("🤖 正在加载模型...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
    try:
        model = AutoModel.from_pretrained(MODEL_PATH, trust_remote_code=True, _attn_implementation='flash_attention_2')
    except:
        model = AutoModel.from_pretrained(MODEL_PATH, trust_remote_code=True)
    
    model = model.eval().cuda().to(torch.bfloat16)

    # 2. 执行批量处理
    process_batch_images(model, tokenizer)

    # 3. 执行合并 (如果你不想合并，可以注释掉下面这行)
    merge_markdown_files(merged_file_name="all_images_merged.md")

if __name__ == "__main__":
    main()
```
# 本地快捷应用封装
## 界面
安装图形界面库：
```dsocr2
pip install PyQt5
```
在`DeepSeek-OCR2-master`下新建一个文件 `app_gui.py`，将以下代码全部复制进去，包含了以下功能：
- 文件列表：支持拖拽或按钮添加图片/PDF，混合排列。
- 灵活合并：可以选择“合并所有”或“单独保存”。
- 实时日志：界面下方有日志窗口，显示转换进度。
- 配置项：可以手动修改模型路径、文件保存路径。
```python
import sys
import os
import io
import time
import contextlib
import threading
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QPushButton, QListWidget, QFileDialog, QLabel, QCheckBox, 
                             QTextEdit, QProgressBar, QLineEdit, QGroupBox, QSplitter, QMessageBox)
from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QIcon, QFont

# 引入核心处理逻辑需要的库
import fitz  # PyMuPDF
from PIL import Image
import torch
from transformers import AutoModel, AutoTokenizer

# ================= 后端处理线程 =================

class OCRWorker(QThread):
    log_signal = pyqtSignal(str)       # 发送日志信号
    progress_signal = pyqtSignal(int)  # 发送进度信号
    finish_signal = pyqtSignal()       # 完成信号

    def __init__(self, file_list, model_path, output_dir, merge_mode, output_filename):
        super().__init__()
        self.file_list = file_list
        self.model_path = model_path
        self.output_dir = output_dir
        self.merge_mode = merge_mode # True: 合并, False: 不合并
        self.output_filename = output_filename
        self.model = None
        self.tokenizer = None
        self.stop_flag = False

    def clean_ocr_output(self, text):
        lines = text.split('\n')
        clean_lines = []
        junk_keywords = [
            "The attention mask", "Setting `pad_token_id`", "BASE:  torch.Size", 
            "PATCHES:  torch.Size", "UserWarning:", "configuration_utils.py", 
            "modeling_deepseekocr2.py", "warnings.warn", "Loading checkpoint", 
            "input_ids", "attention_mask", "position_ids", "get_max_cache"
        ]
        for line in lines:
            if not any(kw in line for kw in junk_keywords):
                clean_lines.append(line)
        return '\n'.join(clean_lines).strip()

    def load_model(self):
        self.log_signal.emit("🤖 正在加载模型 (DeepSeek-OCR2)... 这可能需要几分钟...")
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_path, trust_remote_code=True)
            try:
                self.model = AutoModel.from_pretrained(self.model_path, trust_remote_code=True, _attn_implementation='flash_attention_2')
                self.log_signal.emit("✅ 模型加载成功 (Flash Attention 加速开启)")
            except:
                self.model = AutoModel.from_pretrained(self.model_path, trust_remote_code=True)
                self.log_signal.emit("⚠️ 模型加载成功 (Flash Attention 未安装，使用普通模式)")
            
            self.model = self.model.eval().cuda().to(torch.bfloat16)
            return True
        except Exception as e:
            self.log_signal.emit(f"❌ 模型加载失败: {str(e)}")
            return False

    def run(self):
        if not self.load_model():
            return

        total_files = len(self.file_list)
        all_md_content = f"# OCR Result\n\nDate: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        
        prompt = "<image>\nFree OCR."
        
        for idx, file_path in enumerate(self.file_list):
            if self.stop_flag: break
            
            file_name = os.path.basename(file_path)
            self.log_signal.emit(f"\n📄 [{idx+1}/{total_files}] 正在处理: {file_name}")
            
            # 识别逻辑
            file_content = ""
            images = []

            try:
                # 1. 判断类型并转图片
                if file_path.lower().endswith('.pdf'):
                    pdf_doc = fitz.open(file_path)
                    for p_num in range(pdf_doc.page_count):
                        pix = pdf_doc[p_num].get_pixmap(matrix=fitz.Matrix(2, 2))
                        img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
                        images.append(img)
                    pdf_doc.close()
                else:
                    # 图片
                    img = Image.open(file_path).convert("RGB")
                    images.append(img)
                
                # 2. 逐图推理
                file_content += f"# File: {file_name}\n\n"
                
                for i, img in enumerate(images):
                    self.log_signal.emit(f"   -> 处理页/图 {i+1}/{len(images)}...")
                    
                    temp_path = f"temp_gui_{i}.png"
                    img.save(temp_path)
                    
                    captured_output = io.StringIO()
                    with contextlib.redirect_stdout(captured_output):
                         with contextlib.redirect_stderr(captured_output):
                            self.model.infer(self.tokenizer, prompt=prompt, image_file=temp_path, 
                                            output_path="./dummy", base_size=1024, image_size=768, 
                                            crop_mode=True, save_results=False)
                    
                    raw_text = captured_output.getvalue()
                    clean_text = self.clean_ocr_output(raw_text)
                    
                    if clean_text:
                        file_content += f"\n\n<!-- Page/Part {i+1} -->\n\n{clean_text}"
                    
                    if os.path.exists(temp_path): os.remove(temp_path)

                # 3. 处理结果
                if self.merge_mode:
                    all_md_content += f"\n\n---\n\n{file_content}"
                else:
                    # 单独保存
                    single_out_path = os.path.join(self.output_dir, os.path.splitext(file_name)[0] + ".md")
                    with open(single_out_path, "w", encoding="utf-8") as f:
                        f.write(file_content)
                    self.log_signal.emit(f"   ✅ 已保存至: {single_out_path}")

            except Exception as e:
                self.log_signal.emit(f"❌ 处理出错: {str(e)}")

            # 更新进度条
            progress = int((idx + 1) / total_files * 100)
            self.progress_signal.emit(progress)

        # 如果是合并模式，最后保存大文件
        if self.merge_mode and not self.stop_flag:
            merge_path = os.path.join(self.output_dir, self.output_filename)
            with open(merge_path, "w", encoding="utf-8") as f:
                f.write(all_md_content)
            self.log_signal.emit(f"\n🎉 合并文件已保存至: {merge_path}")
        
        self.finish_signal.emit()

# ================= 前端界面逻辑 =================

class OCRApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("DeepSeek-OCR2 桌面助手")
        self.resize(900, 700)
        self.initUI()
        self.worker = None

    def initUI(self):
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QVBoxLayout(main_widget)

        # 1. 顶部配置区
        config_group = QGroupBox("配置与路径")
        config_layout = QVBoxLayout()
        
        # 模型路径
        h_layout_model = QHBoxLayout()
        h_layout_model.addWidget(QLabel("模型路径:"))
        self.model_path_edit = QLineEdit(r"D:\ModelScope_Cache\models\deepseek-ai\DeepSeek-OCR-2")#替换为你自己的模型路径
        h_layout_model.addWidget(self.model_path_edit)
        config_layout.addLayout(h_layout_model)

        # 输出路径
        h_layout_out = QHBoxLayout()
        h_layout_out.addWidget(QLabel("输出目录:"))
        self.out_path_edit = QLineEdit(os.getcwd()) # 默认当前目录，也可以选择目录
        btn_sel_out = QPushButton("选择")
        btn_sel_out.clicked.connect(self.select_output_dir)
        h_layout_out.addWidget(self.out_path_edit)
        h_layout_out.addWidget(btn_sel_out)
        config_layout.addLayout(h_layout_out)
        
        config_group.setLayout(config_layout)
        layout.addWidget(config_group)

        # 2. 中间文件列表区
        self.file_list_widget = QListWidget()
        self.file_list_widget.setAcceptDrops(True)
        self.file_list_widget.setDragDropMode(QListWidget.InternalMove) # 允许拖拽排序
        
        # 启用文件拖入
        self.file_list_widget.dragEnterEvent = self.dragEnterEvent
        self.file_list_widget.dragMoveEvent = self.dragMoveEvent
        self.file_list_widget.dropEvent = self.dropEvent
        
        btn_layout = QHBoxLayout()
        btn_add_files = QPushButton("添加文件 (PDF/图片)")
        btn_add_files.clicked.connect(self.add_files)
        btn_clear = QPushButton("清空列表")
        btn_clear.clicked.connect(self.file_list_widget.clear)
        btn_layout.addWidget(btn_add_files)
        btn_layout.addWidget(btn_clear)

        layout.addWidget(QLabel("待处理文件 (支持拖拽排序/添加):"))
        layout.addWidget(self.file_list_widget)
        layout.addLayout(btn_layout)

        # 3. 底部操作区
        op_group = QGroupBox("操作选项")
        op_layout = QHBoxLayout()
        
        self.chk_merge = QCheckBox("将结果合并为一个文件")
        self.merge_name_edit = QLineEdit("merged_result.md")
        self.merge_name_edit.setPlaceholderText("合并文件名")
        self.merge_name_edit.setEnabled(False)
        self.chk_merge.toggled.connect(lambda: self.merge_name_edit.setEnabled(self.chk_merge.isChecked()))

        self.btn_start = QPushButton("开始转换")
        self.btn_start.setFixedHeight(40)
        self.btn_start.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;")
        self.btn_start.clicked.connect(self.start_ocr)

        op_layout.addWidget(self.chk_merge)
        op_layout.addWidget(self.merge_name_edit)
        op_layout.addStretch()
        op_layout.addWidget(self.btn_start)
        op_group.setLayout(op_layout)
        layout.addWidget(op_group)

        # 4. 进度与日志
        self.progress_bar = QProgressBar()
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        
        layout.addWidget(self.progress_bar)
        layout.addWidget(QLabel("运行日志:"))
        layout.addWidget(self.log_text)

    # --- 事件处理 ---
    def select_output_dir(self):
        dir_path = QFileDialog.getExistingDirectory(self, "选择输出目录")
        if dir_path:
            self.out_path_edit.setText(dir_path)

    def add_files(self):
        files, _ = QFileDialog.getOpenFileNames(self, "选择文件", "", "Files (*.pdf *.jpg *.jpeg *.png *.bmp)")
        if files:
            self.file_list_widget.addItems(files)

    def dragEnterEvent(self, event):
        if event.mimeData().hasUrls():
            event.accept()
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        if event.mimeData().hasUrls():
            event.setDropAction(Qt.CopyAction)
            event.accept()
        else:
            event.ignore()

    def dropEvent(self, event):
        if event.mimeData().hasUrls():
            event.setDropAction(Qt.CopyAction)
            event.accept()
            links = []
            for url in event.mimeData().urls():
                links.append(str(url.toLocalFile()))
            self.file_list_widget.addItems(links)
        else:
            event.ignore()

    def log(self, text):
        self.log_text.append(text)
        self.log_text.verticalScrollBar().setValue(self.log_text.verticalScrollBar().maximum())

    def start_ocr(self):
        # 收集文件
        files = [self.file_list_widget.item(i).text() for i in range(self.file_list_widget.count())]
        if not files:
            QMessageBox.warning(self, "提示", "请先添加文件！")
            return

        model_path = self.model_path_edit.text()
        output_dir = self.out_path_edit.text()
        merge_mode = self.chk_merge.isChecked()
        merge_name = self.merge_name_edit.text()

        # 锁定界面
        self.btn_start.setEnabled(False)
        self.file_list_widget.setEnabled(False)
        self.progress_bar.setValue(0)
        self.log_text.clear()

        # 启动线程
        self.worker = OCRWorker(files, model_path, output_dir, merge_mode, merge_name)
        self.worker.log_signal.connect(self.log)
        self.worker.progress_signal.connect(self.progress_bar.setValue)
        self.worker.finish_signal.connect(self.on_finish)
        self.worker.start()

    def on_finish(self):
        self.btn_start.setEnabled(True)
        self.file_list_widget.setEnabled(True)
        QMessageBox.information(self, "完成", "所有任务已处理完毕！")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = OCRApp()
    window.show()
    sys.exit(app.exec_())
```
## 快捷运行
在 `app_gui.py` 同级目录下，新建一个文本文档，重命名为 `start_ocr.bat`，输入以下内容：
```BATCH
@echo off
chcp 65001
"C:\Users\...\anaconda3\envs\dsocr2\python.exe" "D:\..\deepseek-ocr2\DeepSeek-OCR-2\DeepSeek-OCR2-master\app_gui.py"
pause
```
请将上述`C:\Users\...\anaconda3\envs\dsocr2\python.exe`替换为自己电脑的用户路径，`D:\..\deepseek-ocr2\DeepSeek-OCR-2\app_gui.py`替换为自己的`app_gui.py`路径。注意，`chcp 65001`是为了解决路径中存在中文字符而使用的。

双击这个 `start_ocr.bat`，看看能不能自动弹出软件界面。如果能，继续下一步。

右键点击 `start_ocr.bat` -> 发送到 -> 桌面快捷方式。

回到桌面，右键点击刚才生成的快捷方式 -> 属性。点击 “更改图标”，选一个好看的图标。在 “运行方式” 里选择 “最小化”（这样启动时那个黑色的 CMD 窗口就会闪一下消失，不会一直挡着）。并将名字改为`DeepSeek-OCR2`。


