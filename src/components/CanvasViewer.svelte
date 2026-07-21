import { onDestroy } from 'svelte';
    import { gridState, scanAllGridCells } from './stores/simulatorStore';

  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;
  
  let stream: MediaStream | null = null;
  let animationFrameId: number;
  let isCapturing = false;

  // 1. 고정해 둘 플레이 영역 기준 해상도 (OpenCV 분석 시 리소스 매칭 표준 규격)
  const BASE_PLAY_WIDTH = 1207 - 713;
  const BASE_PLAY_HEIGHT = 814 - 158;

  // 2. 실시간 측정으로 도출한 흰색 테두리 영역의 전체 창 대비 비율
  const PLAY_AREA_RATIOS = {
    left: 713/1920,
    right: 1207/1920,
    top: 158/1080,
    bottom: 814/1080
  };

  // 실시간 스케일 비율 (유저 모니터 해상도에 맞춰 자동 연산)
  let currentScale = 1.0;
  let originalCaptureSize = { width: 0, height: 0 };

  async function startScreenShare() {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          displaySurface: "window", // 유저가 '니케 창'만 선택할 수 있도록 유도
          frameRate: { ideal: 60 }   // 60fps 목표
        },
        audio: false
      });

      if (videoElement) {
        videoElement.srcObject = stream;
        videoElement.play();
        isCapturing = true;
        
        if (canvasElement) {
          canvasElement.width = BASE_PLAY_WIDTH;
          canvasElement.height = BASE_PLAY_HEIGHT;
        }

        renderLoop();
      }

      stream.getVideoTracks()[0].onended = () => { stopScreenShare(); };
    } catch (error) {
      console.error("화면 공유 실패:", error);
    }
  }

  function stopScreenShare() {
    isCapturing = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (videoElement) videoElement.srcObject = null;
    if (canvasElement) {
      const ctx = canvasElement.getContext('2d');
      ctx?.clearRect(0, 0, BASE_PLAY_WIDTH, BASE_PLAY_HEIGHT);
    }
  }

  function renderLoop() {
    if (!isCapturing || !videoElement || !canvasElement) return;

    const ctx = canvasElement.getContext('2d');
    if (ctx) {
      // 실시간으로 캡처되고 있는 원본 소스의 크기 (예: 1920x1080 또는 2560x1440 등)
      const srcWidth = videoElement.videoWidth;
      const srcHeight = videoElement.videoHeight;

      originalCaptureSize = { width: srcWidth, height: srcHeight };

      // 비율에 맞춰 원본 영상에서 크롭할 '실제 픽셀 좌표(ROI)' 연산
      const sx = srcWidth * PLAY_AREA_RATIOS.left;
      const sy = srcHeight * PLAY_AREA_RATIOS.top;
      const sWidth = (srcWidth * PLAY_AREA_RATIOS.right) - sx;
      const sHeight = (srcHeight * PLAY_AREA_RATIOS.bottom) - sy;

      // 기준 해상도(600x800) 대비 현재 유저가 공유한 창의 플레이 영역 스케일 값 구하기
      // (이 값은 나중에 OpenCV에서 템플릿 이미지를 미세 리사이징할 때 매우 유용하게 쓰입니다)
      currentScale = sWidth / BASE_PLAY_WIDTH;

      // 캔버스 버퍼 초기화
      ctx.clearRect(0, 0, BASE_PLAY_WIDTH, BASE_PLAY_HEIGHT);

      // [핵심] 원본 영상의 플레이 영역(sx, sy, sWidth, sHeight)만 도려내어,
      // 600x800 크기의 캔버스에 가변 스케일링으로 가득 채워 그립니다.
      ctx.drawImage(
        videoElement,
        sx, sy,           // 원본 자르기 시작점
        sWidth, sHeight,   // 자를 가로/세로 영역 크기
        0, 0,             // 캔버스 시작 좌표
        BASE_PLAY_WIDTH, BASE_PLAY_HEIGHT // 캔버스 출력 크기 (600x800 고정)
      );

      scanAllGridCells(ctx);
      // 💡 이제 이 아래 단계에서 '600x800' 크기 기준의 공/벽돌 이미지 리소스를 사용하여
      // OpenCV.js(Web Worker) 분석 코드를 바로 실행하면 됩니다!
    }

    animationFrameId = requestAnimationFrame(renderLoop);
  }

  onDestroy(() => { stopScreenShare(); });
</script>

<main class="container">
  <h2>니케 미니게임 플레이 필드 정규화 뷰어</h2>
  <p class="description">전체화면/창모드 크기에 상관없이 흰색 테두리 영역만 600x900 고정 해상도로 추출합니다.</p>
  
  <div class="controls">
    {#if !isCapturing}
      <button on:click={startScreenShare} class="btn start-btn">게임 창 선택</button>
    {:else}
      <button on:click={stopScreenShare} class="btn stop-btn">공유 중지</button>
    {/if}
  </div>

  {#if isCapturing}
    <div class="info-panel">
      <div class="info-item">원본 캡처 해상도: <span>{originalCaptureSize.width} x {originalCaptureSize.height}</span></div>
      <div class="info-item">보정 스케일 비율: <span>{currentScale.toFixed(3)}x</span></div>
      <div class="info-item">최종 처리 규격: <span class="highlight">{BASE_PLAY_WIDTH} x {BASE_PLAY_HEIGHT} (고정)</span></div>
    </div>
  {/if}

  <div class="viewer-box">
    <video bind:this={videoElement} style="display: none;" autoplay playsinline muted></video>
    
    <div class="canvas-wrapper">
      <canvas bind:this={canvasElement}></canvas>
      {#if !isCapturing}
        <div class="placeholder">
          <p>🎮 사용 방법</p>
          <ol>
            <li>[게임 창 선택] 버튼을 누릅니다.</li>
            <li>공유 대상으로 <b>'니케 게임 실행 창'</b>을 선택합니다.</li>
            <li>여기에 흰색 테두리 영역만 잘라져 600x900 고정 크기로 출력됩니다.</li>
          </ol>
        </div>
      {/if}
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background-color: #0f172a;
    color: #f8fafc;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem;
  }
  .description {
    color: #94a3b8;
    font-size: 0.95rem;
    margin-top: -0.5rem;
    margin-bottom: 1.5rem;
    text-align: center;
  }
  .controls {
    margin-bottom: 1rem;
  }
  .btn {
    padding: 0.8rem 2rem;
    font-size: 1rem;
    font-weight: bold;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.2);
    transition: all 0.2s;
  }
  .start-btn { background-color: #10b981; color: white; }
  .start-btn:hover { background-color: #059669; }
  .stop-btn { background-color: #ef4444; color: white; }
  .stop-btn:hover { background-color: #dc2626; }
  
  .info-panel {
    display: flex;
    gap: 1.5rem;
    background-color: #1e293b;
    padding: 0.8rem 1.5rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    font-size: 0.85rem;
    border: 1px solid #334155;
  }
  .info-item span {
    font-weight: bold;
    color: #38bdf8;
  }
  .info-item .highlight {
    color: #10b981;
  }

  .viewer-box {
    width: 360px; /* UI 레이아웃 가로 크기 (종횡비 2:3 유지) */
    height: 540px;
    background-color: #020617;
    border: 3px solid #38bdf8;
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.7);
  }
  .canvas-wrapper {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: -webkit-optimize-contrast; /* 크롬 브라우저 캔버스 스케일링 화질 보정 */
  }
  .placeholder {
    position: absolute;
    padding: 1.5rem;
    color: #94a3b8;
    font-size: 0.9rem;
    line-height: 1.6;
  }
  .placeholder p {
    font-weight: bold;
    font-size: 1.1rem;
    color: #38bdf8;
    margin-bottom: 0.5rem;
  }
  .placeholder ol {
    padding-left: 1.2rem;
    margin: 0;
  }
</style>