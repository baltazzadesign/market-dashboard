"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import styles from "./balta-jungyong.module.css";

type Chapter = {
  readonly number: number;
  readonly title: string;
  readonly blocks: readonly string[];
};

type Props = {
  chapters: readonly Chapter[];
};

function ScaleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="M5 6h14" />
      <path d="m5 6-3 6h6L5 6Z" />
      <path d="m19 6-3 6h6l-3-6Z" />
      <path d="M8 21h8" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default function BaltaJungyongReader({ chapters }: Props) {
  const [activeNumber, setActiveNumber] = useState(1);
  const [query, setQuery] = useState("");
  const [showContents, setShowContents] = useState(false);
  const [fontStep, setFontStep] = useState(0);

  useEffect(() => {
    const match = window.location.hash.match(/chapter-(\d+)/);
    if (match) {
      const n = Number(match[1]);
      if (chapters.some((chapter) => chapter.number === n)) setActiveNumber(n);
    }
  }, [chapters]);

  const activeIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.number === activeNumber),
  );
  const chapter = chapters[activeIndex] ?? chapters[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter((item) => {
      const haystack = `${item.number} ${item.title} ${item.blocks.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [chapters, query]);

  const moveTo = (number: number) => {
    setActiveNumber(number);
    setShowContents(false);
    window.history.replaceState(null, "", `#chapter-${number}`);
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  return (
    <div className={styles.readerShell} style={{ "--reading-size": `${20 + fontStep * 2}px`, "--reading-size-mobile": `${18 + fontStep * 2}px` } as CSSProperties}>
      <header className={styles.siteHeader}>
        <Link className={styles.brand} href="/">
          <span className={styles.brandMark}>B′</span>
          <span>baltatool</span>
          <span className={styles.version}>2.0</span>
        </Link>

        <div className={styles.headerCenter}>
          <span className={styles.headerRule} />
          <span className={styles.headerTitle}>發陀 中庸</span>
          <span className={styles.headerRule} />
        </div>

        <Link className={styles.headerBadge} href="/balta-jungyong" aria-current="page">
          <ScaleIcon />
          <span>발타 중용</span>
        </Link>
      </header>

      <div className={styles.progressTrack}>
        <span
          className={styles.progressBar}
          style={{ width: `${((activeIndex + 1) / chapters.length) * 100}%` }}
        />
      </div>

      <main className={styles.layout}>
        <aside id="jungyong-contents" className={`${styles.contentsPanel} ${showContents ? styles.contentsOpen : ""}`}>
          <div className={styles.contentsTop}>
            <div>
              <p className={styles.miniLabel}>卷目</p>
              <h2>발타 중용 목차</h2>
            </div>
            <span className={styles.chapterCount}>{chapters.length}章</span>
          </div>

          <label className={styles.searchBox}>
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="장 제목 · 본문 검색"
              aria-label="발타 중용 검색"
            />
          </label>

          <nav className={styles.chapterList} aria-label="발타 중용 목차">
            {filtered.length === 0 && <p className={styles.emptyResult} role="status">검색 결과가 없습니다. 다른 단어로 찾아보세요.</p>}
            {filtered.map((item) => (
              <button
                type="button"
                key={item.number}
                onClick={() => moveTo(item.number)}
                aria-current={item.number === chapter.number ? "page" : undefined}
                className={item.number === chapter.number ? styles.activeChapter : ""}
              >
                <span className={styles.chapterNum}>{String(item.number).padStart(2, "0")}</span>
                <span className={styles.chapterName}>{item.title}</span>
                <span className={styles.chapterGlyph}>›</span>
              </button>
            ))}
          </nav>

          <div className={styles.contentsFooter}>
            <span>發陀中庸</span>
            <small>投資와 삶의 中道</small>
          </div>
        </aside>

        <section className={styles.readingColumn} id={`chapter-${chapter.number}`}>
          <div className={styles.readingTools}>
            <span className={styles.editionLabel}>發陀中庸 · 정제본</span>
            <button className={styles.mobileContentsButton} type="button" aria-expanded={showContents} aria-controls="jungyong-contents" onClick={() => { setShowContents((v) => !v); window.scrollTo({ top: 0 }); }}>
              {showContents ? "목차 닫기" : `목차 · 제${chapter.number}장`}
            </button>
            <div className={styles.fontControls} aria-label="본문 글자 크기">
              <button type="button" aria-label="글자 작게" disabled={fontStep <= -1} onClick={() => setFontStep((s) => Math.max(-1, s - 1))}>가−</button>
              <span>글자 크기</span>
              <button type="button" aria-label="글자 크게" disabled={fontStep >= 2} onClick={() => setFontStep((s) => Math.min(2, s + 1))}>가＋</button>
            </div>
          </div>

          <article className={styles.manuscript}>

            <header className={styles.manuscriptHeader}>
              <div className={styles.seal} aria-hidden="true">
                <span>中</span>
              </div>
              <p className={styles.kicker}>發 陀 中 庸</p>
              <p className={styles.chapterRoman}>卷 {String(chapter.number).padStart(2, "0")}</p>
              <h1>{chapter.title}</h1>
              <h2>제{chapter.number}장</h2>
              <div className={styles.ornament} aria-hidden="true">
                <span />
                <b>◆</b>
                <span />
              </div>
              <p className={styles.subtitle}>때를 살피고, 중심을 지키다.</p>
            </header>

            <div className={styles.bodyText}>
              {chapter.blocks.map((block, index) => (
                index === chapter.blocks.length - 1
                  ? <p className={styles.finalVerse} key={`${chapter.number}-${index}`}>{block}</p>
                  : <p key={`${chapter.number}-${index}`}><span className={styles.verseNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{block}</p>
              ))}
            </div>

            <footer className={styles.manuscriptFooter}>
              <div className={styles.signatureRule} />
              <p>發陀中庸 · 第{chapter.number}章</p>
              <span className={styles.smallSeal}>發陀</span>
            </footer>
          </article>

          <div className={styles.pageNavigation}>
            <button
              type="button"
              onClick={() => activeIndex > 0 && moveTo(chapters[activeIndex - 1].number)}
              disabled={activeIndex === 0}
            >
              <span>이전 장</span>
              <strong>{activeIndex > 0 ? `${chapters[activeIndex - 1].number}. ${chapters[activeIndex - 1].title}` : "처음입니다"}</strong>
            </button>

            <div className={styles.pageIndicator}>
              <b>{String(activeIndex + 1).padStart(2, "0")}</b>
              <span>/</span>
              <span>{String(chapters.length).padStart(2, "0")}</span>
            </div>

            <button
              type="button"
              className={styles.nextButton}
              onClick={() => activeIndex < chapters.length - 1 && moveTo(chapters[activeIndex + 1].number)}
              disabled={activeIndex === chapters.length - 1}
            >
              <span>다음 장</span>
              <strong>
                {activeIndex < chapters.length - 1
                  ? `${chapters[activeIndex + 1].number}. ${chapters[activeIndex + 1].title}`
                  : "마지막입니다"}
              </strong>
            </button>
          </div>

          <p className={styles.readerNote}>
            발타 중용 {chapters.length}장 · 첨부 원고의 주제를 중용의 문체로 재구성한 창작 패러디입니다. 실제 발언의 직접 인용이나 고전 번역문이 아닙니다.
          </p>
        </section>
      </main>
    </div>
  );
}
