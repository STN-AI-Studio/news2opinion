'use client';
import Image from "next/image";
import styles from "./page.module.css";
import { useState } from "react";

// 更新进度状态类型
type ProgressState = {
  step: string;
  pageContent?: {
    title: string;
    description: string;
    contentPreview: string;
    url: string;
  };
  keywords?: string[];
  fetchedCount?: number;
  totalCount?: number;
  fetchedUrls?: Array<{
    url: string,
    title: string,
    contentPreview?: string  // 添加内容预览字段
  }>;
  result?: string; // 添加文本结果字段
  prompt?: string; // 添加prompt字段
};

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const analyzeUrl = async (url: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);

        let boundary;
        while ((boundary = buffer.indexOf('}{')) !== -1) {
          const message = buffer.slice(0, boundary + 1);
          buffer = buffer.slice(boundary + 1);
          processMessage(JSON.parse(message));
        }

        if (buffer.length > 0) {
          try {
            processMessage(JSON.parse(buffer));
            buffer = '';
          } catch (e) {
            // 不完整的JSON保留在缓冲区
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const processMessage = (message: any) => {
    if (message.error) {
      alert(message.error);
      return;
    }

    setProgress(prev => {
      // 如果有新的 fetchedUrls，需要更新或添加
      let updatedFetchedUrls = prev?.fetchedUrls || [];
      if (message.fetchedUrls) {
        message.fetchedUrls.forEach((newUrl: any) => {
          const existingIndex = updatedFetchedUrls.findIndex(
            existing => existing.url === newUrl.url
          );
          if (existingIndex >= 0) {
            // 更新已存在的URL信息
            updatedFetchedUrls[existingIndex] = {
              ...updatedFetchedUrls[existingIndex],
              ...newUrl
            };
          } else {
            // 添加新的URL
            updatedFetchedUrls = [...updatedFetchedUrls, newUrl];
          }
        });
      }

      return {
        ...prev,
        ...message,
        fetchedUrls: updatedFetchedUrls
      };
    });
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>自媒体观点生成器 V0.1</h1>
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

        {progress && (
          <div className={styles.progress}>
            <h3>当前步骤：{progress.step}</h3>
            <div className={styles.step}>
              {progress.keywords && (
                <div>已找到关键词：{progress.keywords.join(', ')}</div>
              )}
              {progress.fetchedUrls && (
                <div className={styles.urls}>
                  <h4>已抓取链接：</h4>
                  <ul>
                    {progress.fetchedUrls.map((item, i) =>
                      <li key={i}>
                        <div className={styles.title}>{item.title}</div>
                        <a href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.urlLink}>
                          {item.url}
                        </a>
                        {item.contentPreview && (
                          <div className={styles.contentPreview}>
                            <strong>内容预览：</strong>{item.contentPreview}
                          </div>
                        )}
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {progress.fetchedCount !== undefined && (
                <progress
                  className={styles.progressElement}
                  value={progress.fetchedCount}
                  max={progress.totalCount}
                />
              )}
            </div>
          </div>
        )}

        {progress?.pageContent && (
          <div className={styles.pagePreview}>
            <h3>原始内容分析</h3>
            <div className={styles.url}>来源：{progress.pageContent.url}</div>
            <div className={styles.title}>{progress.pageContent.title}</div>
            <div className={styles.description}>{progress.pageContent.description}</div>
            <div className={styles.content}>{progress.pageContent.contentPreview}</div>
          </div>
        )}

        {progress?.prompt && (
          <div className={styles.result}>
            {progress.prompt && (
              <div className={styles.prompt}>
                <h3>生成提示词</h3>
                <pre>{progress.prompt}</pre>
              </div>
            )}
            <pre>{progress.result}</pre>
          </div>
        )}
      </main>
    </div>
  );
}
