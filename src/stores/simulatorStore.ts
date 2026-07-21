import { writable } from 'svelte/store';
import { isBlockPresentByNumber, isBlockPresentByNumberDebug } from '../utils/imageHelper';

// 6x8 격자 상태 관리 (0: 빈칸, 1: 블록 존재)
export const gridState = writable<number[][]>(
  Array(8).fill(0).map(() => Array(6).fill(0))
);

// 흰색 테두리 비율 정보 (이전 측정값)
const PLAY_AREA_RATIOS = {
  left: 0.372,
  right: 0.628,
  top: 0.144,
  bottom: 0.760
};

/**
 * 6x8 모든 격자를 순회하며 블록 존재 여부를 업데이트하는 함수
 * @param ctx 캔버스 2D 컨텍스트
 * @param canvasWidth 캔버스의 실제 가로 크기 (600)
 * @param canvasHeight 캔버스의 실제 세로 크기 (900)
 */
export function scanAllGridCells() {
  // 1. 격자 한 칸의 물리적 크기 계산
  const cellWidth = 79;
  const cellHeight = 79;
  const cellGap = 2;
  const margin = 5;

  const tempGrid = Array(8).fill(0).map(() => Array(6).fill(0));

  // 2. 6x8 모든 격자를 이중 루프로 순회
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 6; col++) {
      const cellRange = {
        x: col * cellWidth + col * cellGap + margin,
        y: row * cellWidth + row * cellGap + margin,
        width: cellWidth,
        height: cellWidth
      };

      // imageHelpers에서 제공하는 함수로 판별
      const hasBlock = isBlockPresentByNumber(cellRange);
      
      // 블록이 존재하면 1, 없으면 0 기록
      tempGrid[row][col] = hasBlock ? 1 : 0;
    }
  }

  // 3. Svelte Store 값 갱신 -> 이 값을 구독하는 모든 UI 컴포넌트가 알아서 새로고침됨
  gridState.set(tempGrid);
}

export function scanAllGridCellsDebug(ctx: CanvasRenderingContext2D) {
  // 1. 격자 한 칸의 물리적 크기 계산
  const cellWidth = 79;
  const cellHeight = 79;
  const cellGap = 2;
  const margin = 5;

  const tempGrid = Array(8).fill(0).map(() => Array(6).fill(0));

  // 2. 6x8 모든 격자를 이중 루프로 순회
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 6; col++) {
      const cellRange = {
        x: col * cellWidth + col * cellGap + margin,
        y: row * cellWidth + row * cellGap + margin,
        width: cellWidth,
        height: cellWidth
      };

      // imageHelpers에서 제공하는 함수로 판별
      const hasBlock = isBlockPresentByNumberDebug(ctx ,cellRange, row, col);
      
      // 블록이 존재하면 1, 없으면 0 기록
      tempGrid[row][col] = hasBlock ? 1 : 0;
    }
  }

  // 3. Svelte Store 값 갱신 -> 이 값을 구독하는 모든 UI 컴포넌트가 알아서 새로고침됨
  gridState.set(tempGrid);
}