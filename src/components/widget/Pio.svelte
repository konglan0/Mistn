<script>
  import { onMount, onDestroy } from "svelte";
  import { pioConfig } from "@/config";

  const base = import.meta.env.BASE_URL;
  const modelPath = `${base}pio/models/nana/model.json`; 

  let isSleeping = false;
  let oml2dInstance = null; 

  // 🛏️ Base64 编码的“床”图标 (深灰色，稳如老狗)
  const iconSleep = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiM1NTU1NTUiIHN0cm9rZS13aWR0aD0iMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIgNHYxNiIvPjxwYXRoIGQ9Ik0yIDhoMThhMiAyIDAgMCAxIDIgMnYxMCIvPjxwYXRoIGQ9Ik0yIDE3aDIwIi8+PHBhdGggZD0iTTYgOHY5Ii8+PC9zdmc+`;

  // 🔔 唤醒铃铛图标
  const iconBell = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;

  function wakeUp() {
      const stage = document.getElementById('oml2d-stage');
      if (stage) {
          stage.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
          stage.style.opacity = '1';
          stage.style.transform = 'translateY(0)';
          stage.style.pointerEvents = 'auto'; 
          
          if (oml2dInstance && oml2dInstance.tips) {
             oml2dInstance.tips.notification("七七睡醒啦！", 3000, 9);
          }
      }
      isSleeping = false;
  }

  function sleep() {
      if (oml2dInstance && oml2dInstance.tips) {
          oml2dInstance.tips.notification("那...七七先睡啦，晚安~", 2000, 9);
      }
      setTimeout(() => {
          const stage = document.getElementById('oml2d-stage');
          if(stage) {
              stage.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
              stage.style.opacity = '0';
              stage.style.transform = 'translateY(20px)';
              stage.style.pointerEvents = 'none';
          }
          isSleeping = true;
      }, 1000);
  }

  onMount(async () => {
    if (!pioConfig.enable) return;
    if (pioConfig.hiddenOnMobile && window.matchMedia("(max-width: 1280px)").matches) return;

    // 🔥🔥 核心修复逻辑开始 🔥🔥
    // 1. 检查页面上是否已经有七七了？
    const existingStage = document.getElementById('oml2d-stage');
    
    if (existingStage) {
        // ✅ 如果已经存在：说明是跳转页面过来的。
        // 我们不需要重新加载，只需要确保她是“醒着”的即可。
        console.log("Nana is already here, skipping init.");
        
        // 强制恢复显示 (防止上一页睡着了，这一页按钮没了但人还藏着)
        existingStage.style.opacity = '1';
        existingStage.style.transform = 'translateY(0)';
        existingStage.style.pointerEvents = 'auto';
        isSleeping = false; 

        // 尝试重新获取实例引用 (为了能发气泡)
        if (window.OML2D && window.OML2D.models) {
             // 稍微延迟一点说欢迎语，让感觉更自然
             setTimeout(() => {
                 if(window.OML2D.models[0] && window.OML2D.models[0].tips) {
                     window.OML2D.models[0].tips.notification("欢迎来到我主人空岚的博客！", 4000);
                 }
             }, 500);
        }
        return; // 直接退出，不再执行后面的加载代码！
    }
    // 🔥🔥 核心修复逻辑结束 🔥🔥

    // 如果页面上没有七七，才开始加载
    try {
        await loadScript("https://unpkg.com/oh-my-live2d@latest");
    } catch (e) {
        console.error("无法加载 Live2D 库", e);
        return;
    }

    const { loadOml2d } = window.OML2D;
    if (!loadOml2d) return;

    oml2dInstance = await loadOml2d({
      dockedPosition: pioConfig.position, 
      mobileDisplay: !pioConfig.hiddenOnMobile,
      
      models: [
        {
          path: modelPath,
          scale: 0.1, 
          position: [-20, -10],
          stageStyle: { 
              height: 450,
              width: 300,
              zIndex: 9999 
          },
          motionPreloadStrategy: 'ALL'
        }
      ],

      tips: {
        style: {
           position: 'absolute',
           top: '20px',     
           right: '10px', 
           width: 140,      
           minHeight: 40,   
           padding: '8px 12px',
           backgroundColor: 'rgba(255, 255, 255, 0.95)',
           border: '1px solid #e0e0e0',
           borderRadius: '8px',
           boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
           color: '#666',
           fontSize: '13px',
           lineHeight: '1.4',
           zIndex: 10000,
           pointerEvents: 'none'
        },
        welcomeMessage: {
            message: ["欢迎来到我主人空岚的博客！", "七七在这里等你好久了~", "随便看看吧~"],
            duration: 4000
        },
        idleTips: {
          interval: 10000, 
          message: [
             "这里有好文章哦~",
             "今天在干什么呢？",
             "七七有点饿了...",
             "不要一直盯着我看啦...",
			 "七七今天也很努力哦~",
             "今天天气真不错呀~"
          ]
        },
        touchTips: [
            {
                test: (element) => element.id === 'HitAreaHead', 
                message: ["摸摸头会长不高啦...", "嘿嘿~"],
                motion: "TapHead" 
            },
            {
                test: (element) => element.id === 'HitAreaBody', 
                message: ["不要乱摸啦！", "再摸要生气了！"],
                motion: "TapBody"
            }
        ]
      },

      menus: {
        style: {
            left: pioConfig.position === 'left' ? '0px' : 'auto',
            right: pioConfig.position === 'right' ? '0px' : 'auto',
            bottom: '0px'
        },
        itemStyle: {
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ffffff', 
            borderRadius: '50%',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            cursor: 'pointer'
        },
        items: [
            {
                id: 'sleep',
                // ✅ Base64 图标
                icon: `<img src="${iconSleep}" width="18" height="18" style="display:block;">`,
                title: '睡觉',
                onClick: () => sleep()
            }
        ]
      }
    });
  });

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve(); return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
</script>

{#if isSleeping}
    <div 
        class="pio-wake-btn" 
        on:click={wakeUp} 
        on:keydown={(e) => e.key === 'Enter' && wakeUp()}
        role="button"
        tabindex="0"
        title="呼叫七七"
    >
        {@html iconBell}
        <span class="wake-text">呼叫七七</span>
    </div>
{/if}

<style>
  .pio-wake-btn {
      position: fixed;
      bottom: 25px;
      left: 25px;
      z-index: 10001;
      display: flex;
      align-items: center;
      gap: 8px;
      background: white;
      border: 1px solid #ffadd2;
      color: #ff7875;
      padding: 8px 15px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      transition: all 0.3s ease;
      animation: popIn 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);
  }

  .pio-wake-btn:hover {
      background: #fff0f6;
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(255, 120, 117, 0.2);
  }

  .pio-wake-btn :global(svg) {
      width: 18px;
      height: 18px;
      animation: bellShake 3s infinite ease-in-out;
  }
  
  .wake-text {
      padding-top: 1px;
  }

  @keyframes popIn {
      from { opacity: 0; transform: translateY(10px) scale(0.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes bellShake {
      0%, 90%, 100% { transform: rotate(0deg); }
      92% { transform: rotate(15deg); }
      94% { transform: rotate(-10deg); }
      96% { transform: rotate(5deg); }
      98% { transform: rotate(-5deg); }
  }

  :global(.oml2d-tips) {
      font-family: system-ui, -apple-system, sans-serif !important;
      letter-spacing: 0.5px;
  }
</style>
