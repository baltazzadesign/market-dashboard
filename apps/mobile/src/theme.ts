export const colors = {
  bg: '#060706', panel: '#0B100C', elevated: '#171D15', line: '#66502D',
  text: '#F1EFE4', muted: '#A2A697', gold: '#E4C278', goldDim: '#342B18',
  up: '#FF5553', down: '#329DFF', foreign: '#249DFF', institution: '#FF5053', individual: '#F4C532',
  good: '#83C7A8', warning: '#D5B578',
};
export const numberText = (v: number | null | undefined, digits = 0) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const signed = (v: number | null | undefined, digits = 0) => v == null ? '—' : `${v > 0 ? '+' : ''}${numberText(v, digits)}`;
export const directionColor = (v: number | null | undefined) => v == null || v === 0 ? colors.muted : v > 0 ? colors.up : colors.down;
