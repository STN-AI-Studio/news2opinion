import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// 全局配置变量默认值（当前端未提供时使用）
const DEFAULT_CONFIG = {
  KEYWORDS_COUNT: 5,  // 提取的关键词数量
  SEARCH_RESULTS_PER_KEYWORD: 2  // 每个关键词搜索的网页数量
};

const steps = {
  FETCH_PAGE: '正在获取网页内容',
  EXTRACT_KEYWORDS: '正在提取流量关键词',
  GOOGLE_SEARCH: '正在执行Google搜索',
  FETCH_CONTENTS: '正在抓取网页内容',
  FINAL_ANALYSIS: '正在生成最终报告'
};

// 新增Google搜索函数
async function googleSearch(keyword: string, resultsPerKeyword: number) {
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_KEY}&cx=${process.env.GOOGLE_CX}&q=${encodeURIComponent(keyword)}`);
  const data = await res.json();
  return data.items?.slice(0, resultsPerKeyword).map((item: any) => ({
    url: item.link,
    title: item.title
  })) || [];
}

export async function POST(req: Request) {
  const { url, config } = await req.json();
  
  // 使用前端传递的配置或默认配置
  const CONFIG = {
    KEYWORDS_COUNT: config?.keywordsCount || DEFAULT_CONFIG.KEYWORDS_COUNT,
    SEARCH_RESULTS_PER_KEYWORD: config?.searchResultsPerKeyword || DEFAULT_CONFIG.SEARCH_RESULTS_PER_KEYWORD
  };
  
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
            4. 最多输出${CONFIG.KEYWORDS_COUNT}个关键词
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
        const results = await googleSearch(keyword, CONFIG.SEARCH_RESULTS_PER_KEYWORD);
        // 推送当前关键词的搜索结果，现在包含标题
        await writer.write(encoder.encode(JSON.stringify({
          step: steps.FETCH_CONTENTS,
          fetchedUrls: results,  // 现在包含 url 和 title
          fetchedCount: contents.length + 1,
          totalCount: keywords.keywords.length * CONFIG.SEARCH_RESULTS_PER_KEYWORD
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
      const finalPrompt = `根据以下网页内容生成游戏/ACG领域事件分析报告，要求把事件按照以下格式分类并生成报告：

           新闻来源：
            ${url}
            1. 【事件本质标题】格式参考A主体在B事件中C行为导致D结果，用有逻辑性的语言描述事件本质。
            
            2. 【初步情绪抽取】在表面文字材料的前提下，用一些浅显易懂的情绪形容词来表达对该事件的看法，可以从正面、负面、中立三个角度来描述。

            3. 【事件类别分类】在这样的标签中：热门大作玩法、热门大作剧情、独立游戏、小众游戏、热门玩家社区事件，小众玩家社区事件，热门社会事件，小众社会事件，标签中选择一个标签定义该事件。可以根据前面标签的特点自定义新标签。

            4. 【潜在受众】分析最可能对该事件感兴趣的人群，并给出理由，比如受众的性别，年龄，兴趣爱好，游戏经验等。需要跟前面的事件本质、事件类别分类、初步情绪抽取相结合。

            5. 【主体分析】分析事件中的主体，要求包括主体相关的基本信息。主体类别可以是：个人、组织、产品、事件、游戏等等。至少分析5个主体。

            6. 【理想化事件全程推导】结合之前的分析，找出对事件影响最大的主体和它此次事件的目的，按照理想化情况推导事件全程。

            7. 【实际事件全程推导】结合之前的分析，找出对事件影响最大的主体和它此次事件的目的，按照实际发生情况推导事件全程。

            8. 【矛盾分析】按照主体vs主体的结构，分析事件中的矛盾点,至少分析3对矛盾。需要包含矛盾的描述，矛盾的双方，双方的情绪形容词，矛盾的焦点，矛盾的解决方式。

            9. 【旁观者视角】描述从旁观者的视角中看事件逐步推导和分析时，旁观者产生的情绪变化。

            10.【观点表达】结合所有分析，找到最有流量价值的矛盾点，将事件用情绪化、戏剧化的语言表达出来。至少表达3个观点。

            额外记录：请在这里记录一些细枝末节的、片段的、可能对事件分析有帮助的、但是没有出现在新闻中的信息和笑料。
            

           
            
            【原始网页内容】：
            ${JSON.stringify(pageData)}
            
            【关键词搜索获取的额外内容】：
            ${JSON.stringify(contents)}
            
            请直接返回文本格式，不要包含JSON结构`;
            
      // 先发送步骤和prompt信息
      await writer.write(encoder.encode(JSON.stringify({ 
        step: steps.FINAL_ANALYSIS,
        prompt: finalPrompt
      })));
      
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
            content: finalPrompt
          }]
        })
      });

      const finalResData = await finalRes.json();
      const textResult = finalResData.choices[0].message.content.trim();

      // 发送最终结果
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