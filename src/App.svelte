<script lang="ts">
    import * as GAME from './constants/gameDimensions';
    import { onDestroy, onMount } from 'svelte';
    import { gridState, scanAllGridCells, scanAllGridCellsDebug } from './stores/simulatorStore';
    import { initBallTemplate, captureAndDrawLaunch, captureAndDrawStage, drawTrajectory, findArrow, findArrowDebugInfo, findBall, findBallByHough, findBallDebugInfo } from './utils/imageHelper';
    import { convertGridToBricks, getBall, simulateReflect, type Vector2D } from './utils/physics';
    import { get } from 'svelte/store';

	import ballImgUrl from '/assets/ball.png';

    let videoElement: HTMLVideoElement;
    let canvasElement: HTMLCanvasElement;
    
    let stream: MediaStream | null = null;
    let animationFrameId: number;
    let isCapturing = false;
    let isNewTurn = true;

    // 💡 옵션: 첫 번째 부딪히는 블록 무시 경로 표시 여부 (기본값: false)
    let showGhostTrajectory = false;

    let currentScale = 1.0;
    let originalCaptureSize = { width: 0, height: 0 };

    onMount(() => {
        const ballImg = new Image();
        ballImg.src = ballImgUrl;
        ballImg.onload = () => {
            initBallTemplate(ballImg);
            console.log("Image loaded");
        };

		ballImg.onerror = (err) => {
            console.error("Failed to load ball image:", err);
        };
    });

    async function openCanvasInDocumentPip() {
        if (!('documentPictureInPicture' in window)) {
            alert("현재 브라우저가 Document PiP를 지원하지 않습니다. (Chrome/Edge 최신 버전 권장)");
            return;
        }

        try {
            const parentContainer = canvasElement.parentElement;

            const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
                width: canvasElement.width,
                height: canvasElement.height,
            });

            const style = pipWindow.document.createElement('style');
            style.textContent = `
            body { margin: 0; background: #0c192c; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; }
            canvas { width: 100%; height: 100%; object-fit: contain; }
            `;
            pipWindow.document.head.appendChild(style);

            pipWindow.document.body.appendChild(canvasElement);

            pipWindow.addEventListener('pagehide', () => {
                if (parentContainer) {
                    parentContainer.appendChild(canvasElement);
                }
            });

        } catch (error) {
            console.error("Document PiP 실행 실패:", error);
        }
    }

    async function startScreenShare() {
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { 
                    displaySurface: "window",
                    frameRate: { ideal: 60 },
                    cursor: "never"
                } as any,
                audio: false
            });

            if (videoElement) {
                videoElement.srcObject = stream;
                videoElement.play();
                isCapturing = true;
                
                if (canvasElement) {
                    canvasElement.width = GAME.PLAY_AREA_WIDTH;
                    canvasElement.height = GAME.PLAY_AREA_HEIGHT;
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
            ctx?.clearRect(0, 0, GAME.PLAY_AREA_WIDTH, GAME.PLAY_AREA_HEIGHT);
        }
    }

    function renderLoop() {
        if (!isCapturing || !videoElement || !canvasElement) return;

        const ctx = canvasElement.getContext('2d');
        if (ctx) {
            const srcWidth = videoElement.videoWidth;
            const srcHeight = videoElement.videoHeight;

            originalCaptureSize = { width: srcWidth, height: srcHeight };

            const sx = srcWidth * GAME.PLAY_AREA_RATIOS.left;
            const sy = srcHeight * GAME.PLAY_AREA_RATIOS.top;
            const sWidth = (srcWidth * GAME.PLAY_AREA_RATIOS.right) - sx;
            const sHeight = (srcHeight * GAME.PLAY_AREA_RATIOS.bottom) - sy;

            if (canvasElement.width !== sWidth || canvasElement.height !== sHeight) {
                canvasElement.width = sWidth;
                canvasElement.height = sHeight;
            }

            const scaleX = sWidth / GAME.PLAY_AREA_WIDTH;
            const scaleY = sHeight / GAME.PLAY_AREA_HEIGHT;

            ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

            ctx.drawImage(
                videoElement,
                sx, sy,
                sWidth, sHeight,
                0, 0,
                canvasElement.width, canvasElement.height
            );

            captureAndDrawStage(videoElement);
            captureAndDrawLaunch(videoElement);

            if (isNewTurn)
                scanAllGridCellsDebug(ctx);

            let bricks = convertGridToBricks(get(gridState));

            findBallDebugInfo(ctx, bricks);
            findArrowDebugInfo(ctx);

            let ballPos = findBall(bricks);
            let arrowPos = findArrow();

            let ball = getBall(arrowPos, ballPos);

            // 1. 기본 반사선 연산
            let balls = simulateReflect(ball, bricks);

            // 2. 기본 반사선 그린 (빨간색/주황색 계열)
            drawTrajectory(ctx, balls, 'rgba(255, 71, 87, 0.95)', 10, scaleX, scaleY);

            // 💡 3. 토글 옵션이 켜져있을 때만 첫 블록 무시 2번째 반사선 그리기 (연두색/라임 계열)
            if (showGhostTrajectory) {
                let balls2 = simulateReflect(ball, bricks, 1);
                drawTrajectory(ctx, balls2, 'rgba(46, 213, 115, 0.85)', 10, scaleX, scaleY);
            }
        }

        animationFrameId = requestAnimationFrame(renderLoop);
    }

    onDestroy(() => { stopScreenShare(); });
</script>

<main class="container">
    <header class="header">
        <h1 class="title">ISLAND BREAKER <span class="badge">HELPER</span></h1>
        <p class="description">미니게임 아일랜드 브레이커 반사 궤적 실시간 가이드</p>
    </header>
    
    <!-- 컨트롤 영역 -->
    <div class="controls-card">
        <div class="button-group">
            {#if !isCapturing}
                <button on:click={startScreenShare} class="btn start-btn">
                    🎮 게임 창 선택
                </button>
            {:else}
                <button on:click={stopScreenShare} class="btn stop-btn">
                    ⏹️ 공유 중지
                </button>
            {/if}

            <button on:click={openCanvasInDocumentPip} class="btn pip-btn">
                🖼️ PIP 모드
            </button>
        </div>

        <!-- 옵션 체크박스 스위치 -->
        <div class="option-toggle">
            <label class="toggle-label">
                <input type="checkbox" bind:checked={showGhostTrajectory} />
                <span class="toggle-custom"></span>
                <span class="label-text">
                    첫 블록 관통 궤적 표시
                    <span class="dot-green"></span>
                </span>
            </label>
        </div>
    </div>

    <!-- 정보 패널 -->
    {#if isCapturing}
        <div class="info-panel">
            <div class="info-item">원본: <span>{originalCaptureSize.width}x{originalCaptureSize.height}</span></div>
            <div class="info-item">규격: <span class="highlight">{GAME.PLAY_AREA_WIDTH}x{GAME.PLAY_AREA_HEIGHT}</span></div>
        </div>
    {/if}

    <!-- 메인 뷰어 박스 -->
    <div class="viewer-box">
        <video bind:this={videoElement} style="display: none;" autoplay playsinline muted></video>
        
        <div class="canvas-wrapper">
            <canvas bind:this={canvasElement}></canvas>
            {#if !isCapturing}
                <div class="placeholder">
                    <div class="placeholder-icon">🏝️</div>
                    <p class="placeholder-title">사용 방법</p>
                    <ol>
                        <li>모니터 비율을 <b>16:9 (1920x1080 권장)</b>로 설정, 니케를 전체 창모드로 설정합니다.</li>
                        <li><b>[게임 창 선택]</b>을 누르고 니케 창을 공유합니다.</li>
                        <li>공과 화살표가 인식되면 반사선이 바로 출력됩니다.</li>
                        <li><b>PIP 모드</b>를 활용하면 게임 위에 겹쳐서 볼 수 있습니다.</li>
                    </ol>
                </div>
            {/if}
        </div>
    </div>
</main>

<style>
    :global(body) {
        margin: 0;
        background: linear-gradient(135deg, #0b1329 0%, #172a46 100%);
        color: #f8fafc;
        font-family: 'Pretendard', system-ui, -apple-system, sans-serif;
        min-height: 100vh;
    }

    .container {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 2rem 1rem;
    }

    .header {
        text-align: center;
        margin-bottom: 1.5rem;
    }

    .title {
        font-size: 1.8rem;
        font-weight: 800;
        margin: 0 0 0.4rem 0;
        color: #38bdf8;
        letter-spacing: -0.5px;
        text-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
    }

    .badge {
        font-size: 0.8rem;
        background: #0284c7;
        color: #e0f2fe;
        padding: 0.2rem 0.6rem;
        border-radius: 20px;
        vertical-align: middle;
    }

    .description {
        color: #94a3b8;
        font-size: 0.9rem;
        margin: 0;
    }

    /* 컨트롤 카드 디자인 */
    .controls-card {
        background: rgba(30, 41, 59, 0.7);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 1.2rem;
        border-radius: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.2rem;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }

    .button-group {
        display: flex;
        gap: 0.8rem;
    }

    .btn {
        padding: 0.75rem 1.4rem;
        font-size: 0.95rem;
        font-weight: 700;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .start-btn { background: #10b981; color: white; }
    .start-btn:hover { background: #059669; transform: translateY(-2px); }
    
    .stop-btn { background: #ef4444; color: white; }
    .stop-btn:hover { background: #dc2626; transform: translateY(-2px); }

    .pip-btn { background: #3b82f6; color: white; }
    .pip-btn:hover { background: #2563eb; transform: translateY(-2px); }

    /* 토글 스위치 옵션 */
    .option-toggle {
        padding-top: 0.4rem;
        border-top: 1px dashed rgba(255, 255, 255, 0.15);
        width: 100%;
        display: flex;
        justify-content: center;
    }

    .toggle-label {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        cursor: pointer;
        user-select: none;
    }

    .toggle-label input { display: none; }

    .toggle-custom {
        width: 38px;
        height: 22px;
        background-color: #475569;
        border-radius: 20px;
        position: relative;
        transition: background-color 0.2s;
    }

    .toggle-custom::after {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: white;
        top: 3px;
        left: 3px;
        transition: transform 0.2s;
    }

    .toggle-label input:checked + .toggle-custom {
        background-color: #2ed573;
    }

    .toggle-label input:checked + .toggle-custom::after {
        transform: translateX(16px);
    }

    .label-text {
        font-size: 0.88rem;
        color: #cbd5e1;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.4rem;
    }

    .dot-green {
        width: 8px;
        height: 8px;
        background-color: #2ed573;
        border-radius: 50%;
        display: inline-block;
    }

    /* 정보 패널 */
    .info-panel {
        display: flex;
        gap: 1rem;
        background: rgba(15, 23, 42, 0.6);
        padding: 0.5rem 1rem;
        border-radius: 20px;
        margin-bottom: 1rem;
        font-size: 0.8rem;
        border: 1px solid #334155;
    }
    .info-item span { font-weight: bold; color: #38bdf8; }
    .info-item .highlight { color: #10b981; }

    /* 뷰어 박스 */
    .viewer-box {
		width: 360px;
		/* height: 540px; <- 삭제 또는 주석 처리 */
		aspect-ratio: 494 / 656; /* 💡 실제 플레이 영역 비율 고정 (약 360x478px) */
		
		background-color: #020617;
		border: 3px solid #38bdf8;
		border-radius: 16px;
		overflow: hidden;
		position: relative;
		box-shadow: 0 15px 30px rgba(0, 0, 0, 0.6);
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
    }

    .placeholder {
        position: absolute;
        padding: 1.5rem;
        color: #94a3b8;
        font-size: 0.85rem;
        line-height: 1.6;
        text-align: left;
    }

    .placeholder-icon {
        font-size: 2.5rem;
        text-align: center;
        margin-bottom: 0.5rem;
    }

    .placeholder-title {
        font-weight: bold;
        font-size: 1.05rem;
        color: #38bdf8;
        margin-bottom: 0.6rem;
        text-align: center;
    }

    .placeholder ol {
        padding-left: 1.2rem;
        margin: 0;
    }

    .placeholder li {
        margin-bottom: 0.4rem;
    }
</style>