import { PLAY_AREA_HEIGHT, PLAY_AREA_WIDTH } from "../constants/gameDimensions";
import * as GAME from "../constants/gameDimensions"

export interface Vector2D {
  x: number;
  y: number;
}

export interface Ball {
    pos: Vector2D,
    velocity: Vector2D
}

// 기본값 (공을 못 찾았거나 조준 중이 아닐 때 반환할 공허 객체)
export const DEFAULT_BALL: Ball = {
  pos: { x: 0, y: 0 },
  velocity: { x: 0, y: 0 }
};

/**
 * 발사 원점과 타겟 좌표를 받아 공의 이동 벡터를 생성합니다.
 * @param startPoint 발사 중심 좌표 (P1)
 * @param targetPoint 화살표 추적 등으로 얻은 타겟 좌표 (P2)
 */
export function getBall(startPoint: Vector2D | null, targetPoint: Vector2D | null): Ball | null {
  if (startPoint == null || targetPoint == null)
    return null;
  
    // 1. 단순 변위 계산
  const dx = targetPoint.x - startPoint.x;
  const dy = targetPoint.y - startPoint.y;

  // 2. 벡터의 총 길이(거리) 구하기
  const distance = Math.sqrt(dx * dx + dy * dy);

  // 3. 거리가 0일 경우 예외 처리 후 정규화 방향 벡터 산출
  if (distance === 0) {
    return DEFAULT_BALL;
  }

  return {
    pos : {x: targetPoint.x, y: targetPoint.y},
    velocity: {x: dx / distance, y: dy / distance}
  };
}

// 스토어에서 관리되는 벽돌 구조체
export interface Brick {
  index: number;
  x: number;      // 벽돌 좌상단 X (원래 크기)
  y: number;      // 벽돌 좌상단 Y (원래 크기)
  width: number;  // 고정 가로 크기
  height: number; // 고정 세로 크기
  radius: number; // 벽돌 자체의 둥근 모서리 반지름
  hp: number;
}

// 충돌 세부 정보 구조체
export type CollisionTarget = 
  | 'left' | 'right' | 'top' | 'bottom'  
  | 'TL' | 'TR' | 'BL' | 'BR'            
  | 'wall_left' | 'wall_right' | 'wall_top' | 'wall_bottom'; // 💡 추가

export interface CollisionResult {
  point: Vector2D;             // 공의 중심이 위치하게 될 충돌 좌표
  target: CollisionTarget;     // 충돌한 면/모서리/벽 종류
  brickIndex? : number;            // 벽돌일 경우 해당 벽돌 ID
}

/**
 * 선(Ray)과 원(Circle)의 충돌 시간을 계산하는 2차 방정식 헬퍼 함수
 */
function checkCircleCollision(
  ball : Ball, 
  cx: number, cy: number, r: number
): number | null {
  const dirX = ball.velocity.x
  const dirY = ball.velocity.y;
  const ocX = ball.pos.x - cx;
  const ocY = ball.pos.y - cy;

  // 2차 방정식 계수: ax^2 + bx + c = 0 (방향벡터가 정규화되었으므로 a = 1)
  const b = 2 * (ocX * dirX + ocY * dirY);
  const c = (ocX * ocX + ocY * ocY) - (r * r);
  const discriminant = b * b - 4 * c;

  if (discriminant < 0) return null; // 빗겨감

  const sqrtDisc = Math.sqrt(discriminant);
  const t1 = (-b - sqrtDisc) / 2;
  const t2 = (-b + sqrtDisc) / 2;

  if (t1 >= 0) return t1;
  if (t2 >= 0) return t2; // 이미 겹쳐있거나 뒤로 가는 경우 판정 보정
  return null;
}

const MAP_MIN_X = 3;
const MAP_MAX_X = PLAY_AREA_WIDTH - 3;
const MAP_MIN_Y = 3;
const MAP_MAX_Y = PLAY_AREA_HEIGHT - 3;

export function findNextCollision(
  ball: Ball,
  ballRadius: number,
  bricks: Brick[],
  isFirstBounce = false, // 💡 이전 루프에서 넘어온 첫 충돌 검사 플래그
  lastCollision: CollisionResult | null = null
): CollisionResult | null {
  let closestT = Infinity;
  let closestCollision: CollisionResult | null = null;

  const { pos, velocity } = ball;
  if (velocity.x === 0 && velocity.y === 0) return null;

  // 💡 제자리 충돌 루프를 방지하기 위한 시간(t) 경계선 설정
  // 첫 발사 시점에는 딱 붙어 출발할 수 있으므로 0 이상 허용, 
  // 연속 반사 시점에는 이미 표면에 있으므로 0.0001보다 큰 미래의 충돌만 탐색!
  const minT = isFirstBounce ? 0 : 0.0001;

  //외부 벽 파고듬
  if (pos.x - ballRadius <= MAP_MIN_X && velocity.x < 0 && lastCollision?.target !== 'wall_left') {
    return { target: 'wall_left', point: { x: MAP_MIN_X + ballRadius, y: pos.y } };
  }
  if (pos.x + ballRadius >= MAP_MAX_X && velocity.x > 0 && lastCollision?.target !== 'wall_right') {
    return { target: 'wall_right', point: { x: MAP_MAX_X - ballRadius, y: pos.y } };
  }
  if (pos.y - ballRadius <= MAP_MIN_Y && velocity.y < 0 && lastCollision?.target !== 'wall_top') {
    return { target: 'wall_top', point: { x: pos.x, y: MAP_MIN_Y + ballRadius } };
  }
  if (pos.y + ballRadius >= MAP_MAX_Y && velocity.y > 0 && lastCollision?.target !== 'wall_bottom') {
    return { target: 'wall_bottom', point: { x: pos.x, y: MAP_MAX_Y - ballRadius } };
  }

  // 1. 외벽 충돌 검사
  if (velocity.x < 0 && lastCollision?.target !== 'wall_left') {
    const t = (MAP_MIN_X + ballRadius - pos.x) / velocity.x;
    if (t >= minT && t < closestT) { // ⭕ minT 적용
      closestT = t;
      closestCollision = {
        target: 'wall_left',
        point: { x: MAP_MIN_X + ballRadius, y: pos.y + velocity.y * t }
      };
    }
  }
  if (velocity.x > 0 && lastCollision?.target !== 'wall_right') {
    const t = (MAP_MAX_X - ballRadius - pos.x) / velocity.x;
    if (t >= minT && t < closestT) {
      closestT = t;
      closestCollision = {
        target: 'wall_right',
        point: { x: MAP_MAX_X - ballRadius, y: pos.y + velocity.y * t }
      };
    }
  }
  if (velocity.y < 0 && lastCollision?.target !== 'wall_top') {
    const t = (MAP_MIN_Y + ballRadius - pos.y) / velocity.y;
    if (t >= minT && t < closestT) {
      closestT = t;
      closestCollision = {
        target: 'wall_top',
        point: { x: pos.x + velocity.x * t, y: MAP_MIN_Y + ballRadius }
      };
    }
  }
  if (velocity.y > 0 && lastCollision?.target !== 'wall_bottom') {
    const t = (MAP_MAX_Y - ballRadius - pos.y) / velocity.y;
    if (t >= minT && t < closestT) {
      closestT = t;
      closestCollision = {
        target: 'wall_bottom',
        point: { x: pos.x + velocity.x * t, y: MAP_MAX_Y - ballRadius }
      };
    }
  }


  
  // 2. 벽돌 충돌 검사
  for (let i = 0; i < bricks.length; i++) {
    const brick = bricks[i];
    if (!brick || brick.hp <= 0) continue;

    if (lastCollision?.brickIndex === i)
      continue;
    
    const left = brick.x - ballRadius;
    const right = brick.x + brick.width + ballRadius;
    const top = brick.y - ballRadius;
    const bottom = brick.y + brick.height + ballRadius;

    const corners = [
      { x: brick.x, y: brick.y, type: 'TL', isZone: pos.x < brick.x && pos.y < brick.y },
      { x: brick.x + brick.width, y: brick.y, type: 'TR', isZone: pos.x > brick.x + brick.width && pos.y < brick.y },
      { x: brick.x, y: brick.y + brick.height, type: 'BL', isZone: pos.x < brick.x && pos.y > brick.y + brick.height },
      { x: brick.x + brick.width, y: brick.y + brick.height, type: 'BR', isZone: pos.x > brick.x + brick.width && pos.y > brick.y + brick.height }
    ];


    // 1. 공 중심이 확장 히트박스 외곽에 들어왔는지 확인
    if (pos.x >= left && pos.x <= right && pos.y >= top && pos.y <= bottom) {
      
      // ----------------------------------------------------
      // 🟦 [그림의 top / bottom 영역]: X축은 벽돌 너비 내부
      // ----------------------------------------------------
      const isXInBrick = pos.x >= brick.x && pos.x <= brick.x + brick.width;
      if (isXInBrick) {
        if (pos.y < brick.y && velocity.y > 0 && lastCollision?.target !== 'top') {
          return { target: 'top', brickIndex: i, point: { x: pos.x, y: top } };
        }
        if (pos.y > brick.y + brick.height && velocity.y < 0 && lastCollision?.target !== 'bottom') {
          return { target: 'bottom', brickIndex: i, point: { x: pos.x, y: bottom } };
        }
      }

      // ----------------------------------------------------
      // 🟦 [그림의 left / right 영역]: Y축은 벽돌 높이 내부
      // ----------------------------------------------------
      const isYInBrick = pos.y >= brick.y && pos.y <= brick.y + brick.height;
      if (isYInBrick) {
        if (pos.x < brick.x && velocity.x > 0 && lastCollision?.target !== 'left') {
          return { target: 'left', brickIndex: i, point: { x: left, y: pos.y } };
        }
        if (pos.x > brick.x + brick.width && velocity.x < 0 && lastCollision?.target !== 'right') {
          return { target: 'right', brickIndex: i, point: { x: right, y: pos.y } };
        }
      }

      for (const corner of corners) {
        if (corner.isZone) {
          const ocX = pos.x - corner.x;
          const ocY = pos.y - corner.y;
          const distSq = ocX * ocX + ocY * ocY;
          
          // 꼭짓점 원형 범위(r^2) 안으로 침범했는지 확인
          if (distSq <= ballRadius * ballRadius) {
            if (lastCollision?.target !== corner.type) {
              return { target: corner.type as any, brickIndex: i, point: { x: pos.x, y: pos.y } };
            }
          }
        }
      }
    }


    // --- [A] 면 충돌 검사 ---
    if (velocity.x > 0 && pos.x < left) {
      const t = (left - pos.x) / velocity.x;
      if (t >= minT && t < closestT) { // ⭕ minT 적용
        const hitY = pos.y + velocity.y * t;
        if (hitY >= brick.y && hitY <= brick.y + brick.height) {
          closestT = t;
          closestCollision = { target: 'left', brickIndex: i, point: { x: left, y: hitY } };
        }
      }
    }
    if (velocity.x < 0 && pos.x > right) {
      const t = (right - pos.x) / velocity.x;
      if (t >= minT && t < closestT) {
        const hitY = pos.y + velocity.y * t;
        if (hitY >= brick.y && hitY <= brick.y + brick.height) {
          closestT = t;
          closestCollision = { target: 'right', brickIndex: i, point: { x: right, y: hitY } };
        }
      }
    }
    if (velocity.y > 0 && pos.y < top) {
      const t = (top - pos.y) / velocity.y;
      if (t >= minT && t < closestT) {
        const hitX = pos.x + velocity.x * t;
        if (hitX >= brick.x && hitX <= brick.x + brick.width) {
          closestT = t;
          closestCollision = { target: 'top', brickIndex: i, point: { x: hitX, y: top } };
        }
      }
    }
    if (velocity.y < 0 && pos.y > bottom) {
      const t = (bottom - pos.y) / velocity.y;
      if (t >= minT && t < closestT) {
        const hitX = pos.x + velocity.x * t;
        if (hitX >= brick.x && hitX <= brick.x + brick.width) {
          closestT = t;
          closestCollision = { target: 'bottom', brickIndex: i, point: { x: hitX, y: bottom } };
        }
      }
    }

    // --- [B] 꼭짓점 충돌 검사 ---



    for (const corner of corners) {
      const ocX = pos.x - corner.x;
      const ocY = pos.y - corner.y;

      const a = velocity.x * velocity.x + velocity.y * velocity.y;
      const b = 2 * (ocX * velocity.x + ocY * velocity.y);
      const c = (ocX * ocX + ocY * ocY) - (ballRadius * ballRadius);

      

      const discriminant = b * b - 4 * a * c;

      if (discriminant >= 0) {
        const sqrtD = Math.sqrt(discriminant);
        const t1 = (-b - sqrtD) / (2 * a);
        
        if (t1 >= minT && t1 < closestT) { // ⭕ minT 적용
          closestT = t1;
          closestCollision = {
            target: corner.type as any,
            brickIndex: i,
            point: { x: pos.x + velocity.x * t1, y: pos.y + velocity.y * t1 }
          };
        }
      }
    }
  }

  return closestCollision;
}


export function getReflectedVector(
  ball: Ball,
  collision: CollisionResult,
  bricks: Brick[]
): Vector2D {
  const { target, brickIndex } = collision;

  // 1. 일반 직선 면 및 외벽 반사 처리 (좌우 반전 / 상하 반전)
  if (target === 'wall_left' || target === 'wall_right' || target === 'left' || target === 'right') {
    return { x: -ball.velocity.x, y: ball.velocity.y };
  }
  if (target === 'wall_top' || target === 'wall_bottom' || target === 'top' || target === 'bottom') {
    return { x: ball.velocity.x, y: -ball.velocity.y };
  }

  // 2. 꼭짓점(TL, TR, BL, BR) 충돌 처리
  if (brickIndex !== undefined && ['TL', 'TR', 'BL', 'BR'].includes(target)) {
    const brick = bricks[brickIndex];
    if (!brick || brick.hp <= 0) return { ...ball.velocity };

    // 6x8 격자 구조 기반 인덱스 계산 (가로 격자 수: 6개)
    const COLS = 6; 
    const currentCode = brickIndex;
    const row = Math.floor(currentCode / COLS);
    const col = currentCode % COLS;

    // 인접한 상하좌우 이웃 벽돌의 생존 여부 체크
    const hasLeft = col > 0 && bricks[currentCode - 1]?.hp > 0;
    const hasRight = col < COLS - 1 && bricks[currentCode + 1]?.hp > 0;
    const hasTop = row > 0 && bricks[currentCode - COLS]?.hp > 0;
    const hasBottom = bricks[currentCode + COLS]?.hp > 0; 

    // ----------------------------------------------------------------
    // [A] 이웃 검사 (Neighbor Check): 연속된 벽돌 틈새는 일반 벽면 반사로 치환
    // ----------------------------------------------------------------
    
    // 가로로 이어진 벽의 틈새 꼭짓점들 (위/아래 모서리 틈새) -> 가로 면 맞은 것처럼 Y축만 반전
    if ((target === 'TL' && hasLeft) || (target === 'TR' && hasRight)) {
      return { x: ball.velocity.x, y: -ball.velocity.y };
    }
    if ((target === 'BL' && hasLeft) || (target === 'BR' && hasRight)) {
      return { x: ball.velocity.x, y: -ball.velocity.y };
    }

    // 세로로 이어진 벽의 틈새 꼭짓점들 (좌/우 모서리 틈새) -> 세로 면 맞은 것처럼 X축만 반전
    if ((target === 'TL' && hasTop) || (target === 'BL' && hasBottom)) {
      return { x: -ball.velocity.x, y: ball.velocity.y };
    }
    if ((target === 'TR' && hasTop) || (target === 'BR' && hasBottom)) {
      return { x: -ball.velocity.x, y: ball.velocity.y };
    }

    // ----------------------------------------------------------------
    // [B] 단독 모서리 검사: 주변에 이웃이 없는 '원래 꼭짓점'은 수학적 원 반사 적용
    // ----------------------------------------------------------------
    
    // 타겟 모서리의 정확한 꼭짓점 중심 좌표(cx, cy) 설정
    let cx = brick.x;
    let cy = brick.y;

    if (target === 'TR') cx = brick.x + brick.width;
    else if (target === 'BL') cy = brick.y + brick.height;
    else if (target === 'BR') {
      cx = brick.x + brick.width;
      cy = brick.y + brick.height;
    }

    // 꼭짓점 중심에서 정확한 충돌 접점(collision.point)을 바라보는 법선 벡터(nx, ny) 계산
    let nx = collision.point.x - cx;
    let ny = collision.point.y - cy;
    const distance = Math.hypot(nx, ny);
    
    if (distance > 0) {
      nx /= distance;
      ny /= distance;
    } else {
      // 거리가 0인 극단적인 상황 예외 처리 (진입 방향 반대 방향을 법선으로 설정)
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      nx = -ball.velocity.x / (speed || 1);
      ny = -ball.velocity.y / (speed || 1);
    }

    // 공의 속도와 법선 벡터의 내적(Dot Product) 계산
    let dotProduct = ball.velocity.x * nx + ball.velocity.y * ny;

    // 💡 안전장치: 공이 벽돌 내부로 미세하게 파고들어 내적이 양수(같은 방향)가 나오면 법선을 반전시킴
    if (dotProduct > 0) {
      nx = -nx;
      ny = -ny;
      dotProduct = ball.velocity.x * nx + ball.velocity.y * ny;
    }

    // 수학적으로 정확한 2D 원반사 벡터 공식 적용하여 반환
    return {
      x: ball.velocity.x - 2 * dotProduct * nx,
      y: ball.velocity.y - 2 * dotProduct * ny
    };
  }

  // 매칭되는 타겟이 없을 경우 현재 속도 유지 (안전장치)
  return { ...ball.velocity };
}

export function simulateReflect(
    startBall: Ball | null,
    bricks: Brick[],
    ignoreBlockOrder = 0,
    maxBounces = 1000
): Ball[] {
    if (startBall == null)
        return [];

    let ball = startBall;

    let results: Ball[] = [];
    let lastCollision: CollisionResult | null = null;

    let brickHitCount = 0;
    let ignoreBlockIndex = -1;


    for (let bounce = 0; bounce < maxBounces; bounce++) {
        // 다음 충돌 정보 계산
        let collision = findNextCollision(ball, GAME.BALL_RADIUS, bricks, bounce === 0, lastCollision);

        //console.log("Collision", bounce, collision);
        // 더 이상 충돌할 수 없거나 경로가 끊긴 경우 탈출
        if (!collision) break;

        if (!collision.target.includes("wall")) {
          brickHitCount++;

          if (brickHitCount == ignoreBlockOrder && collision.brickIndex !== undefined) {
            ignoreBlockIndex = collision.brickIndex;

            bricks[ignoreBlockIndex].hp = 0;
            bounce--;

            continue;
          }
        }


        let reflectedVector = getReflectedVector(ball, collision, bricks);

        //console.log(reflectedVector);

        ball = {
            pos: collision.point,
            velocity: reflectedVector
        }

        lastCollision = collision;
        results.push(ball);

        // 💡 아래 벽(바닥)에 꽂혔다면 예측 루프를 여기서 즉시 멈춤
        if (collision.target === 'wall_bottom')
            break;

    }


    if (ignoreBlockIndex >= 0)
      bricks[ignoreBlockIndex].hp = 1;

  return results;
}

export function convertGridToBricks(grid : number[][]): Brick[] {
    const bricks: Brick[] = [];

    const CELL_WIDTH = GAME.CELL_WIDTH;
    const CELL_HEIGHT = GAME.CELL_HEIGHT;
    const CELL_GAP = GAME.CELL_GAP;
    const CELL_RADIUS = GAME.CELL_RADIUS;
    const STAGE_MARGIN = GAME.STAGE_MARGIN;

    const GRID_COLS = GAME.GRID_COLS;
    const GRID_ROWS = GAME.GRID_ROWS;

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
        bricks.push({
          index: row * GRID_COLS + col, // 0 ~ 47 고유 인덱스
          x: col * CELL_WIDTH + col * CELL_GAP + STAGE_MARGIN,
          y: row * CELL_HEIGHT + row * CELL_GAP + STAGE_MARGIN,
          width: CELL_WIDTH,
          height: CELL_HEIGHT,
          radius: CELL_RADIUS,
          hp: grid[row][col] ? 1 : 0
        });
    }
  }

  return bricks;
}