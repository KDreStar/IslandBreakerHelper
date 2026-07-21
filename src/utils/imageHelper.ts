import * as GAME from '../constants/gameDimensions'
import type { Vector2D, Ball, Brick } from './physics';


export interface CellRange {
  x: number;
  y: number;
  width: number;
  height: number;
}

const stageCanvas = document.createElement('canvas');
const launchCanvas = document.createElement('canvas');

stageCanvas.width = GAME.PLAY_AREA_WIDTH;
stageCanvas.height = GAME.PLAY_AREA_HEIGHT;

launchCanvas.width = GAME.LAUNCH_AREA_WIDTH;
launchCanvas.height = GAME.LAUNCH_AREA_HEIGHT;

const stageCtx = stageCanvas.getContext('2d', { willReadFrequently: true })!;
const launchCtx = launchCanvas.getContext('2d', { willReadFrequently: true })!;

export function captureAndDrawStage(video: HTMLVideoElement) {
  const srcWidth = video.videoWidth;
  const srcHeight = video.videoHeight;

  const sx = srcWidth * GAME.PLAY_AREA_RATIOS.left;
  const sy = srcHeight * GAME.PLAY_AREA_RATIOS.top;
  const sWidth = (srcWidth * GAME.PLAY_AREA_RATIOS.right) - sx;
  const sHeight = (srcHeight * GAME.PLAY_AREA_RATIOS.bottom) - sy;

  stageCtx.clearRect(0, 0, stageCanvas.width, stageCanvas.height);

  stageCtx.drawImage(
    video,
    sx, sy,           // 원본 자르기 시작점
    sWidth, sHeight,   // 자를 가로/세로 영역 크기
    0, 0,             // 캔버스 시작 좌표
    stageCanvas.width, stageCanvas.height // 비율
  );
}

export function findArrow(
  fixedScanY = 798 - 704, // 캐릭터 머리와 xn 안 겹치는 안전한 가로선 Y 좌표
  thicknessThreshold = 50 // 화살표가 누웠다고 판단할 기준 픽셀 길이
): Vector2D | null {

  const width = launchCtx.canvas.width;
  const height = launchCtx.canvas.height;
  const imageData = launchCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  let result: Vector2D | null = null;

  // 화살표 색상 판정
  const isArrowColor = (idx: number) => {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];

  // 연노랑 화살표 몸통 알맹이 색상 범위 검사 (스테이지 외곽선 247, 249, 243은 B가 커서 탈락됨)
    return r >= 250 && g >= 250 && b >= 210 && b <= 235;
  };

  // 1. 가로선(ScanY)을 왼쪽부터 오른쪽으로 쭉 훑으며 화살표 픽셀 수집
  let firstX = -1;
  let lastX = -1;
  let sumX = 0;
  let countX = 0;

  for (let x = 0; x < width; x++) {
    const idx = (fixedScanY * width + x) * 4;
    if (isArrowColor(idx)) {
      if (firstX === -1) firstX = x;
      lastX = x;
      sumX += x;
      countX++;
    }
  }

  if (countX === 0) return null; // 화살표가 가로선에 안 걸림

  const arrowWidthOnLine = lastX - firstX; // 가로선에 걸린 화살표의 가로 폭 길이

  // 2. 임계값 판정 루프
  if (arrowWidthOnLine < thicknessThreshold) {
    // [경우 A] 화살표가 서 있는 경우 -> 가로선만으로 중심점 도출
    result = {
      x: sumX / countX,
      y: fixedScanY
    };
  } else {
    // [경우 B] 화살표가 누운 경우 -> 머리 안 겹치는 중앙 부근에 세로선 투하
    const midX = Math.round((firstX + lastX) / 2); // 가로 폭의 정중앙 X
    
    let sumY = 0;
    let countY = 0;

    // 수직 세로선을 위아래로 스캔 (캐릭터 머리에 닿기 전까지만 제한 가능)
    for (let y = 0; y < height; y++) {
      const idx = (y * width + midX) * 4;
      if (isArrowColor(idx)) {
        sumY += y;
        countY++;
      }
    }

    if (countY === 0) {
      // 혹시라도 세로선에 안 걸리면 가로선 중앙값이라도 반환
      result = {
        x: midX,
        y: fixedScanY
      };
    } else {
      result = {
        x: midX,
        y: sumY / countY
      };
    }
  }
  
  if (result == null)
    return null;

  // stage 좌표로 변환
  const stageX = result.x - (GAME.LAUNCH_AREA_WIDTH - GAME.PLAY_AREA_WIDTH) / 2;
  const stageY = result.y + GAME.PLAY_AREA_HEIGHT - GAME.LAUNCH_AREA_HEIGHT;

  //console.log("Arrow pos", result.x, result.y, stageX, stageY);

  return {
    x: stageX,
    y: stageY
  };
}

export function findBall(bricks: Brick[]): Vector2D | null {
  const expectedPos = findBallByHough(bricks);

  if (expectedPos == null)
    return null;

  return findBallByTemplateMatch(expectedPos);
}

function isInsideAnyBrick(x: number, y: number, bricks: Brick[]): boolean {
  // 약간의 여유 마진(Margin)을 두어 블록 살짝 안쪽에 걸치는 것도 제외하도록 설정
  const MARGIN = 2; 

  for (const brick of bricks) {
    // 블록의 상태가 활성화(hp > 0 등)되어 있는지 확인하는 조건이 있다면 추가하세요.
    if (!brick || brick.hp == 0) continue; 

    if (
      x >= brick.x - MARGIN &&
      x <= brick.x + brick.width + MARGIN &&
      y >= brick.y - MARGIN &&
      y <= brick.y + brick.height + MARGIN
    ) {
      return true; // 블록 내부임!
    }
  }
  return false;
}

export function findBallByHough(bricks: Brick[]): Vector2D | null {
  if (typeof cv === 'undefined') return null;

  const width = stageCtx.canvas.width;
  const height = stageCtx.canvas.height;
  const imageData = stageCtx.getImageData(0, 0, width, height);

  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  const circles = new cv.Mat();

  // 1. 흑백 전환 및 블러처리로 노이즈 억제
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);

  // 2. 원형 검출 기법 작동 
  // 공의 지름이 34px이므로 반지름(Radius) 범위를 15px ~ 19px 정도로 타이트하게 제한합니다.
  cv.HoughCircles(gray, circles, cv.HOUGH_GRADIENT, 1, 30, 70, 15, 14, 18);

  let result: Vector2D | null = null;

  if (circles.cols > 0) {
    for (let i = 0; i < circles.cols; i++) {
      const x = circles.data32F[i * 3];
      const y = circles.data32F[i * 3 + 1];

      // 블록 영역 안에 있는 원(숫자/아이콘 오탐)이라면 스킵하고 다음 후보를 확인
      if (isInsideAnyBrick(x, y, bricks)) {
        continue;
      }

      // 블록 바깥에서 처음으로 발견된 원이 진짜 공!
      result = { x: Math.round(x), y: Math.round(y) };
      break; 
    }
  }
  
  src.delete(); gray.delete(); circles.delete();
  return result;
}

let templateMat: any = null;
let maskMat: any = null;
let srcMat: any = null; // 💡 캐싱 버퍼 적극 활용
let dstMat: any = null;
let srcRGB: any = null;




export function initBallTemplate(templateImageElement: HTMLImageElement) {
  // 기존 Mat 객체 안전하게 해제
  if (templateMat) { templateMat.delete(); templateMat = null; }
  if (maskMat) { maskMat.delete(); maskMat = null; }
  if (srcMat) { srcMat.delete(); srcMat = null; }
  if (dstMat) { dstMat.delete(); dstMat = null; }
  if (srcRGB) { srcRGB.delete(); srcRGB = null; }

  const rgbaMat = cv.imread(templateImageElement);
  templateMat = new cv.Mat();
  
  // 글로벌 재사용 버퍼 할당
  srcMat = new cv.Mat(); 
  dstMat = new cv.Mat();
  srcRGB = new cv.Mat();

  // RGBA -> RGB 변환
  cv.cvtColor(rgbaMat, templateMat, cv.COLOR_RGBA2RGB);
  
  // 알파 채널 분리 및 마스크 생성
  const rgbaChannels = new cv.MatVector();
  cv.split(rgbaMat, rgbaChannels);
  
  // 💥 [메모리 누수 방지] get(3)이 생성한 Mat을 copyTo로 복사 후 개별 해제
  const alphaChannel = rgbaChannels.get(3);
  
  maskMat = new cv.Mat();

  // 🎯 [핵심] 알파 채널을 0과 255로 명확히 나눕니다.
  cv.threshold(alphaChannel, maskMat, 10, 255, cv.THRESH_BINARY);

  alphaChannel.delete();
  rgbaMat.delete();
  rgbaChannels.delete();
}

export function findBallByTemplateMatch(expectedPos: Vector2D, threshold = 0.75): Vector2D | null {
  if (typeof cv === 'undefined' || !templateMat || !maskMat || !srcMat || !dstMat) return null;

  //console.log("Hough", expectedPos);

  const width = stageCtx.canvas.width;
  const height = stageCtx.canvas.height;

  // 1. ImageData 추출 및 srcMat 갱신
  const imageData = stageCtx.getImageData(0, 0, width, height);
  
  // 💥 matFromImageData 생성 전 이전 srcMat 메모리 해제
  srcMat.delete(); 
  srcMat = cv.matFromImageData(imageData); 

  cv.cvtColor(srcMat, srcRGB, cv.COLOR_RGBA2RGB);

  // 2. 🎯 [ROI 설정] expectedPos 기준 탐색 범위 지정
  const ROI_MARGIN = GAME.BALL_RADIUS * 2 + 5; 
  const roiX = Math.max(0, Math.floor(expectedPos.x - templateMat.cols / 2 - ROI_MARGIN));
  const roiY = Math.max(0, Math.floor(expectedPos.y - templateMat.rows / 2 - ROI_MARGIN));
  
  const roiWidth = Math.min(width - roiX, templateMat.cols + ROI_MARGIN * 2);
  const roiHeight = Math.min(height - roiY, templateMat.rows + ROI_MARGIN * 2);

  // ROI가 템플릿 규격보다 작으면 검사 불가
  if (roiWidth < templateMat.cols || roiHeight < templateMat.rows) {
    return null;
  }

  // 3. ROI 영역 추출
  const rect = new cv.Rect(roiX, roiY, roiWidth, roiHeight);
  const roiMat = srcRGB.roi(rect);

  try {
    // 4. 템플릿 매칭
    cv.matchTemplate(roiMat, templateMat, dstMat, cv.TM_SQDIFF, maskMat);

    const result = cv.minMaxLoc(dstMat);
    const minVal = result.minVal; // 가장 차이가 적은(일치하는) 위치의 제곱 오차 합계
    const minLoc = result.minLoc;

    // 2. 🎯 불투명 마스크 픽셀의 총 개수 구하기
    const opaquePixelCount = cv.countNonZero(maskMat);

    // 3. 픽셀당 평균 제곱 오차 (Mean Squared Error)
    // Channel이 RGB 3개라면 채널당 평균 오차로 환산
    const msePerPixel = minVal / (opaquePixelCount * 3); 

    // 4. 평균 픽셀 색상 차이 (0 ~ 255 RGB 스케일 오차)
    const avgColorDiff = Math.sqrt(msePerPixel);

    //console.log(`불투명 영역 픽셀당 평균 색상 차이: 약 ${avgColorDiff.toFixed(2)} RGB`);

    if (avgColorDiff > 30)
      return null;

    //console.log("Ball", expectedPos.x, expectedPos.y, Math.round(roiX + minLoc.x + templateMat.cols / 2), Math.round(roiY + minLoc.y + templateMat.rows / 2));

    // 6. 좌표 복원
    return {
      x: Math.round(roiX + minLoc.x + templateMat.cols / 2),
      y: Math.round(roiY + minLoc.y + templateMat.rows / 2)
    };
  } finally {
    // 💥 [핵심] try-finally 구문을 적용하여 예외/early return 상황에서도 roiMat 해제 보장
    roiMat.delete();
  }
}


export function findArrowDebugInfo(mainCtx: CanvasRenderingContext2D): void {
  // 공을 찾지 못했다면 아무것도 그리지 않고 리턴
  let arrowPos = findArrow();

  if (!arrowPos) return;

  // 1. 현재 메인 해상도와 1920 규격의 스케일 비율 계산
  const scaleX = mainCtx.canvas.width / GAME.PLAY_AREA_WIDTH;
  const scaleY = mainCtx.canvas.height / GAME.PLAY_AREA_HEIGHT;

  // 2. 1920 기준 좌표를 메인 캔버스 화면 좌표로 변환
  const screenX = arrowPos.x * scaleX;
  const screenY = arrowPos.y * scaleY;

  mainCtx.save(); // 기존 스타일 컨텍스트 저장

  // 3. 공 중심점에 빨간색 십자선(Crosshair) 렌더링
  mainCtx.strokeStyle = '#ff0000'; // 선 색상: 빨강
  mainCtx.lineWidth = 2;           // 선 두께: 2px

  // 가로선 (길이 40px)
  mainCtx.beginPath();
  mainCtx.moveTo(screenX - 10, screenY);
  mainCtx.lineTo(screenX + 10, screenY);
  mainCtx.stroke();

  // 세로선 (길이 40px)
  mainCtx.beginPath();
  mainCtx.moveTo(screenX, screenY - 10);
  mainCtx.lineTo(screenX, screenY + 10);
  mainCtx.stroke();

  mainCtx.restore(); // 스타일 컨텍스트 복원
}

export function findBallDebugInfo(mainCtx: CanvasRenderingContext2D, bricks: Brick[]): void {
  // 공을 찾지 못했다면 아무것도 그리지 않고 리턴
  let ballPos = findBall(bricks);

  if (!ballPos) return;

  // 1. 현재 메인 해상도와 1920 규격의 스케일 비율 계산
  const scaleX = mainCtx.canvas.width / GAME.PLAY_AREA_WIDTH;
  const scaleY = mainCtx.canvas.height / GAME.PLAY_AREA_HEIGHT;

  // 2. 1920 기준 좌표를 메인 캔버스 화면 좌표로 변환
  const screenX = ballPos.x * scaleX;
  const screenY = ballPos.y * scaleY;

  mainCtx.save(); // 기존 스타일 컨텍스트 저장

  // 3. 공 중심점에 빨간색 십자선(Crosshair) 렌더링
  mainCtx.strokeStyle = '#ff0000'; // 선 색상: 빨강
  mainCtx.lineWidth = 2;           // 선 두께: 2px

  // 가로선 (길이 40px)
  mainCtx.beginPath();
  mainCtx.moveTo(screenX - 10, screenY);
  mainCtx.lineTo(screenX + 10, screenY);
  mainCtx.stroke();

  // 세로선 (길이 40px)
  mainCtx.beginPath();
  mainCtx.moveTo(screenX, screenY - 10);
  mainCtx.lineTo(screenX, screenY + 10);
  mainCtx.stroke();

  mainCtx.restore(); // 스타일 컨텍스트 복원
}

export function captureAndDrawLaunch(video: HTMLVideoElement) {
  const srcWidth = video.videoWidth;
  const srcHeight = video.videoHeight;

  const sx = srcWidth * GAME.LAUNCH_AREA_RATIOS.left;
  const sy = srcHeight * GAME.LAUNCH_AREA_RATIOS.top;
  const sWidth = (srcWidth * GAME.LAUNCH_AREA_RATIOS.right) - sx;
  const sHeight = (srcHeight * GAME.LAUNCH_AREA_RATIOS.bottom) - sy;

  launchCtx.clearRect(0, 0, launchCanvas.width, launchCanvas.height);

  launchCtx.drawImage(
    video,
    sx, sy,           // 원본 자르기 시작점
    sWidth, sHeight,   // 자를 가로/세로 영역 크기
    0, 0,             // 캔버스 시작 좌표
    launchCanvas.width, launchCanvas.height // 비율
  );
}

/*
function calculateArrowDirection(ctx: any) {

}

export function getAimVector(): AimVector {
  // 1. 공의 좌표 찾기
  const ballPos = findBallPosition(stageCtx);
  
  // 공이 확실히 보이지 않는다면 연산을 중단하고 기본값 반환
  if (!ballPos) {
    return DEFAULT_AIM_VECTOR;
  }

  // 2. 화살표의 각도를 벡터로 반환받기
  const arrowDir = calculateArrowDirection(launchCtx);

  // 3. 방향 벡터 정규화 (크기를 1로 맞춤 - 피타고라스 정리)
  const length = Math.sqrt(arrowDir.x * arrowDir.x + arrowDir.y * arrowDir.y);
  const normalizedDir = length > 0 
    ? { x: arrowDir.x / length, y: arrowDir.y / length } 
    : { x: 0, y: -1 };

  // 최종 셋 반환
  return {
    origin: ballPos,
    direction: normalizedDir
  };
}
*/

/**
 * 특정 격자(Cell) 영역 내에 숫자의 '흰색' 픽셀이 충분히 존재하는지 검사하는 함수
 * @param ctx 캔버스 2D 컨텍스트
 * @param cell 검사할 격자 칸의 좌표 및 크기 정보
 * @returns 블록 존재 여부 (true / false)
 */
export function isBlockPresentByNumber(
  cell: CellRange
): boolean {
  // 1. 성능 최적화를 위해 해당 격자 내부 전체가 아니라, 
  //    숫자가 위치할 만한 '가운데 세로 영역'만 잘라내어 픽셀 데이터를 가져옵니다.
  const scanWidth = Math.round(cell.width * 0.4);   // 가로의 중앙 40% 영역만
  const scanHeight = Math.round(cell.height * 0.4); // 세로의 상단부터 40% 영역까지 (랩처+일반 커버)
  const scanX = cell.x + Math.round((cell.width - scanWidth) / 2);
  const scanY = cell.y + Math.round(cell.height * 0.05);

  const imgData = stageCtx.getImageData(scanX, scanY, scanWidth, scanHeight);
  const data = imgData.data; // [R, G, B, A, R, G, B, A, ...] 구조의 1차원 배열

  let whitePixelCount = 0;
  
  // 2. 픽셀들을 순회하며 '숫자의 흰색'에 해당하는 픽셀 수 카운트
  // 니케 폰트의 흰색은 아주 밝으므로 미세한 그림자를 제외하고 타이트하게 잡습니다.
  const WHITE_THRESHOLD = 235; 

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r == 255 && g == 255 && b == 255) {
      break;
    }

    // R, G, B 채널이 모두 임계값보다 크면 '흰색'으로 판정
    if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
      
      whitePixelCount++;
    }
  }

  // 3. 흰색 픽셀의 개수가 일정 기준값 이상이면 "숫자가 존재한다(=블록이 있다)"고 판단
  const totalPixels = scanWidth * scanHeight;
  const whiteRatio = whitePixelCount / totalPixels;

  return whiteRatio > 0.02; // 2% 이상이 흰색이면 블록이 있는 것으로 판정
}


export function isBlockPresentByNumberDebug(
  ctx: CanvasRenderingContext2D, 
  cell: CellRange,
  row: number,
  col: number
): boolean {
  // 1. 실제 숫자가 들어올 영역(가운데 좁은 세로) 계산
  const scanWidth = Math.round(cell.width * 0.4);   // 가로의 중앙 40% 영역만
  const scanHeight = Math.round(cell.height * 0.4); // 세로의 상단부터 40% 영역까지 (랩처+일반 커버)
  const scanX = cell.x + Math.round((cell.width - scanWidth) / 2);
  const scanY = cell.y + Math.round(cell.height * 0.05);

  const imgData = ctx.getImageData(scanX, scanY, scanWidth, scanHeight);
  const data = imgData.data;

  let whitePixelCount = 0;
  const WHITE_THRESHOLD = 235; 

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r == 255 && g == 255 && b == 255) {
      break;
    }

    if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
      whitePixelCount++;
    }
  }

  const totalPixels = scanWidth * scanHeight;
  const whiteRatio = whitePixelCount / totalPixels;
  const hasBlock = whiteRatio > 0.02; // 2% 기준

  // ==========================================
  // 🎨 실시간 캔버스 디버그 드로잉 레이어 시작
  // ==========================================
  ctx.save(); // 기존 캔버스 그리기 상태 저장

  // ① 검사 영역 빨간 네모 가이드선 그리기
  ctx.strokeStyle = hasBlock ? '#ef4444' : '#3b82f6'; // 블록이 있으면 선명한 빨간색, 없으면 파란색
  ctx.lineWidth = 1.5;
  ctx.strokeRect(scanX, scanY, scanWidth, scanHeight);

  // ② 흰색 픽셀 점유율(%) 텍스트 표시
  ctx.fillStyle = hasBlock ? '#fca5a5' : '#93c5fd';
  ctx.font = 'bold 10px monospace';
  ctx.textBaseline = 'top';
  // 감지된 비율을 백분율(%)로 표기 (예: "R: 5.2%")
  const percentText = `${(whiteRatio * 100).toFixed(1)}%`;
  ctx.fillText((percentText + ", " + whitePixelCount), scanX + 2, scanY + 2);

  // ③ 격자 좌표 디버깅 텍스트 (예: "[0,1]")
  ctx.fillStyle = '#64748b';
  ctx.font = '8px sans-serif';
  ctx.fillText(`[${row},${col}]`, cell.x + 2, cell.y + 2);

  ctx.restore(); // 캔버스 상태 복구
  // ==========================================

  return hasBlock;
}

export function drawTrajectory(
  ctx: CanvasRenderingContext2D,
  collisionBalls: Ball[],
  color: string,
  maxBounces=5,
  scaleX = 1,
  scaleY = 1
) {
// 2. 캔버스 패스 그리기 시작
  ctx.save(); // 기존 캔버스 상태 저장
  ctx.beginPath();
  

  // 3. 점선 스타일 및 색상 지정 (스타일에 맞게 커스텀 가능)
  
  ctx.strokeStyle = color; // 반투명 흰색 가이드라인
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (let bounce=0; bounce < collisionBalls.length - 1 && bounce < maxBounces; bounce++) {
    let firstPos = collisionBalls[bounce].pos;
    let secondPos = collisionBalls[bounce+1].pos;

    ctx.moveTo(firstPos.x * scaleX, firstPos.y * scaleY);
    ctx.lineTo(secondPos.x * scaleX, secondPos.y * scaleY);
  }

  ctx.stroke();
  ctx.restore();
}