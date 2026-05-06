import type { Point } from '../../domain/types';
import type { Filter } from '../Filter';

/**
 * 2D Калман-фильтр для сглаживания GPS-трека.
 * State: [lat, lon, v_lat, v_lon]; наблюдаем только координаты.
 * См. ТЗ §6.1 — формулы матриц F, H, Q, R.
 *
 * Реализация: стандартный Kalman predict/update в координатах градусов.
 * Скорость восстанавливается из последовательных наблюдений.
 *
 * Возвращает точку с сглаженными координатами и source='kalman'.
 * Не отбрасывает точки.
 */
export class KalmanFilter implements Filter {
  readonly name = 'KalmanFilter';

  // Состояние [lat, lon, v_lat (deg/s), v_lon (deg/s)]
  private state: [number, number, number, number] | null = null;
  // Ковариационная матрица 4x4 (row-major)
  private P: number[] | null = null;
  private lastTimestamp: number | null = null;

  /** Process-noise в deg²/с⁴ (производное от user-friendly m²/с⁴). */
  private readonly qDeg2: number;

  constructor(
    /**
     * Ускорение модели (м²/с⁴). 0.25 разумно для бегуна (порядка 0.5 м/с² noise).
     * Внутри конвертируется в deg² для согласованности со state в градусах.
     */
    qMps2: number = 0.25,
  ) {
    // 1 deg ≈ 111320 м → 1 м² ≈ 1/111320² deg²
    this.qDeg2 = qMps2 / (111320 * 111320);
  }

  apply(point: Point): Point | null {
    if (this.state === null || this.P === null || this.lastTimestamp === null) {
      // Initial state: измерение = state, скорость = 0, P большое для координат и малое для скорости.
      this.state = [point.latitude, point.longitude, 0, 0];
      // Initial P: стартуем с большой неопределённости по координатам и скорости,
      // чтобы фильтр быстро подстраивался под первые точки. Значения в deg²/с².
      const accDeg = (point.accuracy ?? 10) / 111320;
      const sigma2 = accDeg * accDeg;
      this.P = [
        sigma2 * 4, 0, 0, 0,
        0, sigma2 * 4, 0, 0,
        0, 0, sigma2 * 100, 0,
        0, 0, 0, sigma2 * 100,
      ];
      this.lastTimestamp = point.timestamp;
      return point; // первая точка — без сглаживания
    }

    const dt = Math.max(0.001, (point.timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = point.timestamp;

    // ---- Predict ----
    // x' = F x   (F = [[1,0,dt,0],[0,1,0,dt],[0,0,1,0],[0,0,0,1]])
    const [latS, lonS, vLat, vLon] = this.state;
    const xPred: [number, number, number, number] = [
      latS + dt * vLat,
      lonS + dt * vLon,
      vLat,
      vLon,
    ];

    // P' = F P F^T + Q
    const F = this.makeF(dt);
    const P0 = this.matmul4(F, this.P);
    const Pp = this.matmulT4(P0, F);
    const Q = this.makeQ(dt);
    addInPlace4(Pp, Q);

    // ---- Update ----
    // R адаптивный по accuracy (deg² — переводим м в градусы; 1 deg ≈ 111320 м)
    const accM = point.accuracy ?? 10; // если null — предположим 10м
    const sigmaDeg = accM / 111320;
    const R00 = sigmaDeg * sigmaDeg;
    const R11 = R00;

    // Innovation y = z - H x' (H забирает первые две координаты)
    const y0 = point.latitude - xPred[0];
    const y1 = point.longitude - xPred[1];

    // S = H P' H^T + R   = top-left 2x2 of P' + R
    const s00 = Pp[0] + R00;
    const s01 = Pp[1];
    const s10 = Pp[4];
    const s11 = Pp[5] + R11;
    const detS = s00 * s11 - s01 * s10;
    if (Math.abs(detS) < 1e-30) {
      // singular — пропускаем update
      this.state = xPred;
      this.P = Pp;
      return point;
    }

    // S^-1 = [[s11, -s01], [-s10, s00]] / detS
    const sInv00 = s11 / detS;
    const sInv01 = -s01 / detS;
    const sInv10 = -s10 / detS;
    const sInv11 = s00 / detS;

    // K = P' H^T S^-1   (P' H^T — первые две колонки P', 4x2)
    const PHT0 = [Pp[0], Pp[1]]; // row 0
    const PHT1 = [Pp[4], Pp[5]]; // row 1
    const PHT2 = [Pp[8], Pp[9]]; // row 2
    const PHT3 = [Pp[12], Pp[13]]; // row 3

    const K = [
      [PHT0[0] * sInv00 + PHT0[1] * sInv10, PHT0[0] * sInv01 + PHT0[1] * sInv11],
      [PHT1[0] * sInv00 + PHT1[1] * sInv10, PHT1[0] * sInv01 + PHT1[1] * sInv11],
      [PHT2[0] * sInv00 + PHT2[1] * sInv10, PHT2[0] * sInv01 + PHT2[1] * sInv11],
      [PHT3[0] * sInv00 + PHT3[1] * sInv10, PHT3[0] * sInv01 + PHT3[1] * sInv11],
    ];

    // x = x' + K y
    const xNew: [number, number, number, number] = [
      xPred[0] + K[0][0] * y0 + K[0][1] * y1,
      xPred[1] + K[1][0] * y0 + K[1][1] * y1,
      xPred[2] + K[2][0] * y0 + K[2][1] * y1,
      xPred[3] + K[3][0] * y0 + K[3][1] * y1,
    ];

    // P = (I - K H) P'   = P' - K * (top 2 rows of P')
    const PpRow0 = [Pp[0], Pp[1], Pp[2], Pp[3]];
    const PpRow1 = [Pp[4], Pp[5], Pp[6], Pp[7]];
    const Pnew = Pp.slice();
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const idx = r * 4 + c;
        Pnew[idx] = Pp[idx] - K[r][0] * PpRow0[c] - K[r][1] * PpRow1[c];
      }
    }

    this.state = xNew;
    this.P = Pnew;

    return {
      ...point,
      latitude: xNew[0],
      longitude: xNew[1],
      source: 'kalman',
    };
  }

  reset(): void {
    this.state = null;
    this.P = null;
    this.lastTimestamp = null;
  }

  // === helpers (4x4 row-major) ===

  private makeF(dt: number): number[] {
    return [
      1, 0, dt, 0,
      0, 1, 0, dt,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
  }

  private makeQ(dt: number): number[] {
    const q = this.qDeg2;
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt2 * dt2;
    const a = (q * dt4) / 4;
    const b = (q * dt3) / 2;
    const c = q * dt2;
    return [
      a, 0, b, 0,
      0, a, 0, b,
      b, 0, c, 0,
      0, b, 0, c,
    ];
  }

  private matmul4(A: number[], B: number[]): number[] {
    const out = new Array<number>(16);
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        let s = 0;
        for (let k = 0; k < 4; k += 1) {
          s += A[i * 4 + k] * B[k * 4 + j];
        }
        out[i * 4 + j] = s;
      }
    }
    return out;
  }

  /** A * B^T — оптимизация без явной транспозиции. */
  private matmulT4(A: number[], B: number[]): number[] {
    const out = new Array<number>(16);
    for (let i = 0; i < 4; i += 1) {
      for (let j = 0; j < 4; j += 1) {
        let s = 0;
        for (let k = 0; k < 4; k += 1) {
          s += A[i * 4 + k] * B[j * 4 + k];
        }
        out[i * 4 + j] = s;
      }
    }
    return out;
  }
}

function addInPlace4(A: number[], B: number[]): void {
  for (let i = 0; i < 16; i += 1) A[i] += B[i];
}
