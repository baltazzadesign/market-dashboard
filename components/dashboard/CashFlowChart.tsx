'use client';
import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CASH_FLOW_COLORS, type CashFlowChartRow } from '@/lib/cash-flow-image';

// Both the page and PNG use the same series, colors and null-gap behavior.
export default function CashFlowChart({ rows, exporting = false }: { rows: CashFlowChartRow[]; exporting?: boolean }) {
  return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 15, right: 10, bottom: 5, left: 5 }}>
    <CartesianGrid stroke="#263529" vertical={false} strokeDasharray="3 5"/>
    <XAxis dataKey="year" minTickGap={12} tick={{ fontSize: exporting ? 15 : 11 }} stroke="#9ca99f" tickLine={false} axisLine={false}/>
    <YAxis stroke="#9ca99f" tick={{ fontSize: exporting ? 14 : 12 }} tickLine={false} axisLine={false} width={80} tickFormatter={v => Number(v).toLocaleString('ko-KR', { notation: 'compact' })}/>
    {!exporting && <Tooltip cursor={{ fill: 'var(--cf-raised)', fillOpacity: 0.65 }} contentStyle={{ background: 'var(--cf-surface)', border: '1px solid var(--cf-border)', borderRadius: 6, fontSize: 12, boxShadow: '0 8px 24px #0005' }} labelStyle={{ color: 'var(--cf-gold)', marginBottom: 8 }} formatter={v => [Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 }) + '억원']}/>}
    <ReferenceLine y={0} stroke="#9ca99f" strokeWidth={1.5}/>
    <Bar isAnimationActive={false} dataKey="영업" fill={CASH_FLOW_COLORS.operating} maxBarSize={28} radius={[3, 3, 0, 0]}/>
    <Bar isAnimationActive={false} dataKey="투자" fill={CASH_FLOW_COLORS.investing} maxBarSize={28} radius={[3, 3, 0, 0]}/>
    <Bar isAnimationActive={false} dataKey="재무" fill={CASH_FLOW_COLORS.financing} maxBarSize={28} radius={[3, 3, 0, 0]}/>
    <Line isAnimationActive={false} dataKey="잉여현금" stroke={CASH_FLOW_COLORS.fcf} strokeWidth={2.5} dot={{ r: 3.5, fill: '#0d120e', strokeWidth: 2 }} activeDot={{ r: 5 }} connectNulls={false}/>
  </ComposedChart></ResponsiveContainer>;
}
