// 현재 우측 상단의 "발타경" 버튼 바로 옆에 이 Link를 추가하세요.
// 별도 아이콘 패키지 없이, 목업에서 사용한 저울 아이콘을 그대로 SVG로 넣었습니다.

import Link from "next/link";

export function BaltaJungyongHeaderLink() {
  return (
    <Link href="/balta-jungyong" className="reading-link" title="발타 중용 읽기" aria-label="발타 중용 읽기">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M5 6h14" />
        <path d="m5 6-3 6h6L5 6Z" />
        <path d="m19 6-3 6h6l-3-6Z" />
        <path d="M8 21h8" />
      </svg>
      <span>발타 중용</span>
    </Link>
  );
}
