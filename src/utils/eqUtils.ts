import { EqBandPayload } from '../context/EQContext';

export function interpolateGainAtFrequency(targetFreq: number, sourceBands: { freq: number; gain: number }[]): number {
  if (!sourceBands || sourceBands.length === 0) return 0;
  
  const sorted = [...sourceBands].sort((a, b) => a.freq - b.freq);
  
  if (targetFreq <= sorted[0].freq) return sorted[0].gain;
  if (targetFreq >= sorted[sorted.length - 1].freq) return sorted[sorted.length - 1].gain;

  let idx = 0;
  while (idx < sorted.length - 1 && sorted[idx + 1].freq < targetFreq) {
    idx++;
  }
  const b1 = sorted[idx];
  const b2 = sorted[idx + 1];

  const log1 = Math.log10(b1.freq);
  const log2 = Math.log10(b2.freq);
  const logTarget = Math.log10(targetFreq);
  const t = (logTarget - log1) / (log2 - log1);

  const smoothT = (1 - Math.cos(t * Math.PI)) / 2;
  return Number((b1.gain + (b2.gain - b1.gain) * smoothT).toFixed(1));
}

export function generateSplinePaths(
  bands: EqBandPayload[],
  svgWidth: number,
  svgHeight: number,
  plotX: number,
  plotWidth: number,
  plotYTop: number,
  plotYBottom: number
) {
  if (!bands || bands.length === 0) return { linePath: '', areaPath: '', points: [] };

  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);

  const freqToX = (freq: number) => {
    const clampedFreq = Math.max(20, Math.min(20000, freq));
    const t = (Math.log10(clampedFreq) - minLog) / (maxLog - minLog);
    return plotX + t * plotWidth;
  };
  
  const gainToY = (gain: number) => {
    const clampedGain = Math.max(-30, Math.min(30, gain));
    // Scale factor
    const midY = (plotYBottom + plotYTop) / 2;
    const heightPerDb = (plotYBottom - plotYTop) / 60; 
    return midY - (clampedGain * heightPerDb);
  };

  const points = bands.map((b) => {
    const x = freqToX(b.freq);
    const y = gainToY(b.gain);
    return { x, y, b };
  });

  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    linePath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  const lastX = points[points.length - 1].x;
  const firstX = points[0].x;
  const areaPath = `${linePath} L ${lastX} ${plotYBottom} L ${firstX} ${plotYBottom} Z`;

  return { linePath, areaPath, points };
}
