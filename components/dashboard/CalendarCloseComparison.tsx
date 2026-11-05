import { formatNumber, valueClass } from '@/lib/balta-model';
import { compareCloses, type CalendarCloses, type CalendarSelection } from '@/lib/calendar-presentation';
import styles from './CalendarCloseComparison.module.css';

export type DateSlot = keyof CalendarSelection;
type Props = {
  selection: CalendarSelection;
  closes: CalendarCloses;
  picking: DateSlot | null;
  onPick: (slot: DateSlot | null) => void;
  onClear: () => void;
};

export default function CalendarCloseComparison({ selection, closes, picking, onPick, onClear }: Props) {
  const { A, B } = selection;
  return <section className={styles.panel} aria-label="마감 지수 비교">
    <div className={styles.controls}>
      <h3>마감 지수 비교</h3>
      {(['A', 'B'] as const).map(slot => (
        <button type="button" key={slot} className={styles.slot} aria-pressed={picking === slot}
          aria-label={`선택 ${slot} · ${slot === 'A' ? '기준일' : '비교일'}`}
          onClick={() => onPick(picking === slot ? null : slot)}>
          <strong>선택 {slot}</strong><span>{selection[slot] || (slot === 'A' ? '기준일' : '비교일')}</span>
        </button>
      ))}
      {(A || B || picking) && <button type="button" className={styles.clear} onClick={onClear}>초기화</button>}
    </div>
    <p role="status" className={styles.hint}>{picking
      ? `달력에서 ${picking === 'A' ? '기준일 A' : '비교일 B'}를 선택하세요. 다른 달도 선택할 수 있습니다.`
      : A && B ? '기준일 A 대비 비교일 B의 종가 변화입니다.'
      : '선택 A 또는 B를 누른 뒤 달력에서 종가가 있는 날짜를 고르세요.'}</p>
    {(A || B) && <table className={styles.results} aria-label="두 날짜의 종가 차이">
      <thead><tr><th scope="col">지수</th><th scope="col">A 종가</th><th scope="col">B 종가</th><th scope="col">차이 (pt)</th><th scope="col">등락률</th></tr></thead>
      <tbody>{(['kospi','kosdaq'] as const).map(market => {
        const a = closes[A]?.[market], b = closes[B]?.[market];
        const delta = compareCloses(a, b);
        return <tr key={market}><th scope="row">{market.toUpperCase()}</th>
          <td>{formatNumber(a?.price, 2)}</td><td>{formatNumber(b?.price, 2)}</td>
          <td className={valueClass(delta?.points)}>{formatNumber(delta?.points, 2, true)}</td>
          <td className={valueClass(delta?.percent)}>{delta ? formatNumber(delta.percent, 2, true) + '%' : '—'}</td>
        </tr>;
      })}</tbody>
    </table>}
  </section>;
}
