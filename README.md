# 自媒体观点生成器

一个基于Next.js开发的自动化工具，可以从新闻URL中提取关键信息并生成结构化的观点分析。

## 功能特点

- 自动提取网页关键内容
- 智能识别流量关键词
- Google搜索相关内容
- 生成多维度观点分析
- 实时进度反馈
- 支持流式响应

## 技术栈

- Next.js 15
- React 19
- TypeScript
- Cheerio
- 百度千帆大模型API
- Google Custom Search API

## 环境要求

- Node.js 18+
- 需要配置以下环境变量:

```1:3:example.env
QIANFAN_KEY=your_qianfan_key
GOOGLE_KEY=your_google_key
GOOGLE_CX=your_google_cx
```


## 安装

```bash
git clone [repository-url]
cd news2opinion
npm install
```

## 开发

```bash
npm run dev
```

## 构建

```bash
npm run build
npm start
```

## 项目结构

```
src/
  ├── app/
  │   ├── api/
  │   │   └── analyze/    # API路由处理
  │   ├── page.tsx        # 主页面组件
  │   ├── layout.tsx      # 布局组件
  │   └── globals.css     # 全局样式
  └── ...
```

## 使用方法

1. 在输入框中粘贴新闻URL
2. 按回车开始分析
3. 等待进度条完成
4. 查看生成的分析报告，包含:
   - 标题
   - 摘要
   - 整体印象
   - 主体分析
   - 时间线
   - 正反观点矩阵

## API说明

### POST /api/analyze

输入:
```json
{
  "url": "新闻页面URL"
}
```

输出:
```json
{
  "title": "标题",
  "summary": "摘要",
  "impression": "整体印象",
  "entities": ["相关主体"],
  "timeline": ["事件时间线"],
  "opinions": [
    {
      "type": "正面/反面/中立",
      "content": "观点内容",
      "subpoints": ["支撑论据"]
    }
  ]
}
```

## 许可证

MIT

## 贡献

欢迎提交Issue和Pull Request
