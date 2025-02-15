'use client';
import Image from "next/image";
import styles from "./page.module.css";
import { useState } from "react";

// 添加结果类型定义
interface AnalysisResult {
  title: string;
  impression: string;
  entities: string[];
  opinions: {
    type: '正面' | '反面' | '中立';
    content: string;
    subpoints: string[];
  }[];
  summary?: string;
  timeline?: string[];
}

export default function Home() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);

  const analyzeUrl = async (url: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url })
      });
      console.log(res);
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>自媒体观点生成器</h1>
        <input 
          type="url"
          placeholder="输入新闻URL"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              analyzeUrl((e.target as HTMLInputElement).value)
            }
          }}
        />
        
        {loading && <div className={styles.loading}>生成中...</div>}
        
        {result && (
          <div className={styles.result}>
            <h2>{result.title}</h2>
            {result.summary && <div className={styles.summary}>{result.summary}</div>}
            <div className={styles.tag}>{result.impression}</div>
            <div className={styles.section}>
              <h3>主体分析</h3>
              <ul>
                {(result.entities || []).map((e,i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
            <div className={styles.section}>
              <h3>时间线</h3>
              <ul className={styles.timeline}>
                {(result.timeline || []).map((t,i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
            <div className={styles.section}>
              <h3>观点矩阵</h3>
              {(result.opinions || []).map((o,i) => (
                <div key={i} className={styles.opinion}>
                  <div className={styles[o.type]}>{o.type}</div>
                  <p>{o.content}</p>
                  <ul>
                    {(o.subpoints || []).map((s,j) => <li key={j}>{s}</li>)}
                  </ul>
                </div>
              ))}
              {!result.opinions?.length && <p>暂无观点分析</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
