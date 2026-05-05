import React from 'react';
import { View } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { PingRecord } from './usePing';

const CYAN = '#00e5ff';
const YELLOW = '#ffd600';
const RED = '#ff3d00';
const GRID_COLOR = '#1e1e1e';

function barColor(rtt: number) {
  if (rtt < 20) return CYAN;
  if (rtt < 60) return YELLOW;
  return RED;
}

type Props = {
  records: PingRecord[];
  width: number;
  height?: number;
};

export function LatencyChart({ records, width, height = 100 }: Props) {
  if (records.length === 0) return <View style={{ width, height }} />;

  const padding = { top: 8, bottom: 18, left: 0, right: 0 };
  const chartH = height - padding.top - padding.bottom;
  const maxRtt = Math.max(...records.map((r) => r.rtt), 60);
  const barCount = records.length;
  const gap = 2;
  const barW = Math.max(1, (width - gap * (barCount - 1)) / barCount);

  // Grid lines at 20ms and 60ms
  const gridLines = [20, 60].filter((v) => v <= maxRtt);

  return (
    <Svg width={width} height={height}>
      {/* grid */}
      {gridLines.map((v) => {
        const y = padding.top + chartH - (v / maxRtt) * chartH;
        return (
          <Line
            key={v}
            x1={0}
            y1={y}
            x2={width}
            y2={y}
            stroke={GRID_COLOR}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        );
      })}

      {/* bars */}
      {records.map((r, i) => {
        const barH = Math.max(2, (r.rtt / maxRtt) * chartH);
        const x = i * (barW + gap);
        const y = padding.top + chartH - barH;
        return (
          <Rect
            key={r.id}
            x={x}
            y={y}
            width={barW}
            height={barH}
            fill={barColor(r.rtt)}
            rx={1}
          />
        );
      })}

      {/* x-axis label */}
      <SvgText
        x={0}
        y={height - 2}
        fontSize={9}
        fill="#555"
      >
        last {barCount} pings
      </SvgText>
    </Svg>
  );
}
