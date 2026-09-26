declare module '@audio/pitch-yin' {
  export interface YinOptions {
    fs?: number;
    threshold?: number;
    minFreq?: number;
    maxFreq?: number;
  }

  export interface YinResult {
    freq: number;
    clarity: number;
  }

  export default function yin(
    data: Float32Array | Float64Array,
    options?: YinOptions,
  ): YinResult | null;
}
