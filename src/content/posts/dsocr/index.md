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
>**tips:**请确保你的 `INPUT_DIR` 路径里真的有 PDF 文件。

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

