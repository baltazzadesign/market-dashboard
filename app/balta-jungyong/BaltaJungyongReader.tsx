"use client";

import { useEffect, useMemo, useState } from "react";
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className={styles.readerShell}>
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
        <aside className={`${styles.contentsPanel} ${showContents ? styles.contentsOpen : ""}`}>
          <div className={styles.contentsTop}>
            <div>
              <p className={styles.miniLabel}>卷目</p>
              <h2>발타 중용 목차</h2>
            </div>
            <span className={styles.chapterCount}>33章</span>
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
            {filtered.map((item) => (
              <button
                type="button"
                key={item.number}
                onClick={() => moveTo(item.number)}
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
          <button className={styles.mobileContentsButton} type="button" onClick={() => setShowContents((v) => !v)}>
            {showContents ? "목차 닫기" : `목차 · 제${chapter.number}장`}
          </button>

          <article className={styles.manuscript}>
            <div className={styles.paperGrain} aria-hidden="true" />
            <div className={styles.paperStainOne} aria-hidden="true" />
            <div className={styles.paperStainTwo} aria-hidden="true" />

            <header className={styles.manuscriptHeader}>
              <div className={styles.seal} aria-hidden="true">
                <span>中</span>
              </div>
              <p className={styles.kicker}>BALTATOOL · 發陀中庸</p>
              <p className={styles.chapterRoman}>卷 {String(chapter.number).padStart(2, "0")}</p>
              <h1>제{chapter.number}장</h1>
              <h2>{chapter.title}</h2>
              <div className={styles.ornament} aria-hidden="true">
                <span />
                <b>◆</b>
                <span />
              </div>
              <p className={styles.subtitle}>흔들리지 않기 위하여, 가운데의 길을 읽습니다.</p>
            </header>

            <div className={styles.bodyText}>
              {chapter.blocks.map((block, index) => {
                const isLast = index === chapter.blocks.length - 1;
                const isShortEmphasis = block.length < 45 && index > 0;

                if (isLast || isShortEmphasis) {
                  return (
                    <blockquote className={isLast ? styles.finalVerse : styles.shortVerse} key={`${chapter.number}-${index}`}>
                      {block}
                    </blockquote>
                  );
                }

                return <p key={`${chapter.number}-${index}`}>{block}</p>;
              })}
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
            발타 중용 33장 · 업로드된 「발타중용.xlsx」 본문을 웹 읽기 형식으로 구성한 페이지입니다.
          </p>
        </section>
      </main>
    </div>
  );
}
