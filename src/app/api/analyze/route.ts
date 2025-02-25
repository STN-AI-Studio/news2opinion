import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const steps = {
  FETCH_PAGE: '正在获取网页内容',
  EXTRACT_KEYWORDS: '正在提取流量关键词',
  GOOGLE_SEARCH: '正在执行Google搜索',
  FETCH_CONTENTS: '正在抓取网页内容',
  FINAL_ANALYSIS: '正在生成最终报告'
};

// 新增Google搜索函数
async function googleSearch(keyword: string) {
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_KEY}&cx=${process.env.GOOGLE_CX}&q=${encodeURIComponent(keyword)}`);
  const data = await res.json();
  return data.items?.slice(0, 2).map((item: any) => ({
    url: item.link,
    title: item.title
  })) || [];
}

export async function POST(req: Request) {
  const { url } = await req.json();
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();
  
  (async () => {
    try {
      // 推送网页获取步骤
      await writer.write(encoder.encode(JSON.stringify({ 
        step: steps.FETCH_PAGE,
        data: { url }  // 包含原始URL
      })));

      // 直接获取网页内容
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const pageRes = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const html = await pageRes.text();
      const $ = cheerio.load(html);
      
      // 提取关键内容后再次推送带内容的更新
      const pageData = {
        title: $('title').text(),
        description: $('meta[name="description"]').attr('content') || '',
        content: $('body').text().substring(0, 10000) // 截取前10000字符
      };
      
      // 推送网页内容摘要
      await writer.write(encoder.encode(JSON.stringify({
        step: steps.FETCH_PAGE,
        pageContent: {
          ...pageData,
          contentPreview: pageData.content.substring(0, 200) + '...',
          url
        }
      })));
     
      // 步骤3：提取关键词
      await writer.write(encoder.encode(JSON.stringify({ step: steps.EXTRACT_KEYWORDS })));
      const keywordsRes = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ARK_API_KEY}`
        },
        body: JSON.stringify({
          model: "ep-20250213151422-75z99",
          messages: [{
            role: "user",
            content: `请从以下网页内容中提取最具传播潜力的流量关键词，要求：
            1. 聚焦内容核心矛盾或亮点
            2. 选择具有话题性和争议性的词汇
            3. 优先包含网络热词或时事关联词
            4. 最多输出2个关键词
            5. 输出格式：
            {
              keywords: string[]
            }
            
            网页内容：${JSON.stringify(pageData)}
            请直接返回合法JSON，不要包含其他内容`
          }]
        })
      });

      const keywordResData = await keywordsRes.json();
      const keywordString = keywordResData.choices[0].message.content
      .replace(/^```json\s*/, '')  // 移除开头的```json
      .replace(/```\s*$/, '')           // 移除结尾的```
      .trim();
      const keywords = JSON.parse(keywordString);

      // 推送提取的关键词
      await writer.write(encoder.encode(JSON.stringify({ 
        step: steps.EXTRACT_KEYWORDS,
        keywords: keywords.keywords // 确保获取 keywords 数组
      })));

      // 步骤4-6：搜索并获取内容
      await writer.write(encoder.encode(JSON.stringify({ 
        step: steps.GOOGLE_SEARCH,
        data: { keywords: keywords.keywords }
      })));
      
      const contents = [];
      for (const keyword of keywords.keywords) {
        const results = await googleSearch(keyword);
        // 推送当前关键词的搜索结果，现在包含标题
        await writer.write(encoder.encode(JSON.stringify({
          step: steps.FETCH_CONTENTS,
          fetchedUrls: results,  // 现在包含 url 和 title
          fetchedCount: contents.length + 1,
          totalCount: keywords.keywords.length * 2
        })));

        for (const result of results) {
          const content = await fetch(result.url).then(r => r.text());
          const contentText = cheerio.load(content).text().substring(0, 10000); // Limit content to 10000 characters
          contents.push({ keyword, content: contentText });
          
          // 发送带有内容预览的更新
          await writer.write(encoder.encode(JSON.stringify({
            step: steps.FETCH_CONTENTS,
            fetchedUrls: [{
              url: result.url,
              title: result.title,
              contentPreview: contentText.substring(0, 200) + '...'  // 添加内容预览
            }]
          })));
        }
      }

      // 步骤7：最终分析
      await writer.write(encoder.encode(JSON.stringify({ step: steps.FINAL_ANALYSIS })));
      await writer.write(encoder.encode(JSON.stringify(contents)));
      const finalRes = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ARK_API_KEY}`
        },
        body: JSON.stringify({
          model: "ep-20250213151422-75z99",
          messages: [{
            role: "user",
            content: `根据以下网页内容生成会议讨论材料，要求：
            1. 标题要带情绪化修饰词
            2. 主体分析要识别至少5个利益相关方
            3. 观点要包含正反两面各3个角度
            4. 用年轻人喜欢的网络热梗进行类比
            5. 输出结构：
             {
               title: string
               summary: string
               impression: string
               entities: string[]
               timeline: string[]
               opinions: {
                 type: '正面' | '反面' | '中立'
                 content: string
                 subpoints: string[]
               }[]
             }
            原始内容：${JSON.stringify(contents)}`
          }]
        })
      });

      writer.write(encoder.encode(JSON.stringify(finalRes)));

      // 解析返回的JSON字符串
      const finalResData = await finalRes.json();
      const jsonString = finalResData.choices[0].message.content
        .replace(/^```json\s*/, '')  // 移除开头的```json
        .replace(/```\s*$/, '')           // 移除结尾的```
        .trim();
      const analysisResult = JSON.parse(jsonString);

      await writer.write(encoder.encode(JSON.stringify(analysisResult)));
      await writer.close();
    } catch (error) {
      await writer.write(encoder.encode(JSON.stringify({ error: '处理失败' })));
      await writer.close();
    }
  })();

  return new Response(responseStream.readable, {
    headers: { 'Content-Type': 'application/stream+json' }
  });
}