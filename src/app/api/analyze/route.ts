import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req: Request) {
  const { url } = await req.json();
  
  try {
    // 直接获取网页内容
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const pageRes = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const html = await pageRes.text();
    const $ = cheerio.load(html);
    
    // 提取关键内容
    const pageData = {
      title: $('title').text(),
      description: $('meta[name="description"]').attr('content') || '',
      content: $('body').text().substring(0, 2000) // 截取前2000字符
    };
    console.log(pageData);

    // DeepSeek R1结构化分析
    const deepseekRes = await fetch('https://qianfan.baidubce.com/v2/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.QIANFAN_KEY}`
      },
      body: JSON.stringify({
        model: "deepseek-r1",
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
          原始内容：${JSON.stringify(pageData)}`
        }]
      })
    });

    const data = await deepseekRes.json();
    
    // 解析返回的JSON字符串
    const jsonString = data.choices[0].message.content
    .replace(/^```json\s*/, '')  // 移除开头的```json
    .replace(/```\s*$/, '')           // 移除结尾的```
    .trim();
    const analysisResult = JSON.parse(jsonString);
    
    return NextResponse.json(analysisResult);
  } catch (error) {
    return NextResponse.json(
      { error: '分析失败' },
      { status: 500 }
    );
  }
}