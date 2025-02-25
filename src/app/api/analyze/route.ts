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
          model: "ep-20250213151422-75z99", // DeepSeek V3
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
      const finalRes = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ARK_API_KEY}`
        },
        body: JSON.stringify({
          model: "ep-20250212142132-dt2hj", // DeepSeek R1
          messages: [{
            role: "user",
            content: `根据以下网页内容生成游戏/ACG领域热点事件分析报告，要求：
            1. 【情绪化标题】标题需包含网络流行梗或热词，采用《XXX》+感叹号+争议点表述形式
            2. 【多维度分析】识别至少5个利益相关方，用「主体：特征描述」格式说明各方立场
            3. 【辩证观点】包含正反中立三方观点各3个，每个观点需：
               - 使用「梗图式类比」如"赵本山卖拐式营销"
               - 包含2-3个具体论据子项
               - 涉及不同利益相关方的博弈关系
            4. 【结构化输出】采用游戏玩家熟悉的术语体系，包含：
               - 包袱（埋梗点）
               - 副标题（补充说明）
               - 实拍（具体案例）
            5. 输出格式：
            新闻标题：
            《网络热词》事件核心矛盾
            
            一句话概括新闻内容：
            用梗文化语言概括事件本质
            
            第一印象：
            第一反应梗评
            
            新闻来源：
            ${url}
            
            摘要：
            主体：
            主体1：特征描述
            主体2：行为模式
            ...（至少5个）
            
            事件全程：
            🍉起因梗化描述
            ⚡️转折名场面
            💥结果预测
            
            观点：
            1. 正面观点：立场概括（使用流行句式）
            观点+热梗类比
            - 🎮类比游戏场景
            - 🤔矛盾点分析
            - 🕹️预测发展
            
            2. 反面观点：立场概括（使用流行句式）
            观点+热梗类比
            - 🎮类比游戏场景
            - 🤔矛盾点分析
            - 🕹️预测发展
            
            3. 中立观点：立场概括（使用流行句式）
            观点+热梗类比
            - 🎮类比游戏场景
            - 🤔矛盾点分析
            - 🕹️预测发展
            
            原始内容：${JSON.stringify(contents)}
            请直接返回文本格式，不要包含JSON结构`
          }]
        })
      });

      const finalResData = await finalRes.json();
      const textResult = finalResData.choices[0].message.content.trim();

      // 直接发送文本结果
      await writer.write(encoder.encode(JSON.stringify({ 
        step: steps.FINAL_ANALYSIS,
        result: textResult
      })));
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