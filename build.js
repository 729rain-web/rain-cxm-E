// build.js — 讀取 Notion 資料，產生 index.html
// 執行方式：node build.js

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── 設定區（從環境變數讀取，不要直接寫在這裡）──
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DB = {
  pages:      process.env.DB_PAGES,
  scenes:     process.env.DB_SCENES,
  scenarios:  process.env.DB_SCENARIOS,
  quiz:       process.env.DB_QUIZ,
  principles: process.env.DB_PRINCIPLES,
  results:    process.env.DB_RESULTS,
};

// ── Notion API 工具函數 ──
function notionQuery(databaseId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sorts: [{ property: 'order', direction: 'ascending' }] });
    const options = {
      hostname: 'api.notion.com',
      path: `/v1/databases/${databaseId}/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 取出 Notion 屬性值的工具
function prop(page, key, type = 'rich_text') {
  const p = page.properties[key];
  if (!p) return '';
  if (type === 'title') return p.title?.[0]?.plain_text || '';
  if (type === 'rich_text') return p.rich_text?.[0]?.plain_text || '';
  if (type === 'number') return p.number ?? 0;
  if (type === 'checkbox') return p.checkbox ?? false;
  if (type === 'select') return p.select?.name || '';
  return '';
}

// ── 主流程 ──
async function build() {
  console.log('📡 讀取 Notion 資料...');

  const [pagesData, scenesData, scenariosData, quizData, principlesData, resultsData] = await Promise.all([
    notionQuery(DB.pages),
    notionQuery(DB.scenes),
    notionQuery(DB.scenarios),
    notionQuery(DB.quiz),
    notionQuery(DB.principles),
    notionQuery(DB.results),
  ]);

  // 整理資料
  const pages = pagesData.results.reduce((acc, p) => {
    const id = prop(p, 'page_id', 'title');
    acc[id] = {
      sec_eye: prop(p, 'sec_eye'),
      heading: prop(p, 'heading').replace(/\\n/g, '\n'),
      visible: prop(p, 'visible', 'checkbox'),
    };
    return acc;
  }, {});

  const scenes = scenesData.results
    .filter(p => true)
    .map(p => ({
      label: prop(p, 'label', 'title'),
      title: prop(p, 'title'),
      desc:  prop(p, 'desc'),
      color: prop(p, 'color', 'select'),
      order: prop(p, 'order', 'number'),
    }))
    .sort((a, b) => a.order - b.order);

  const scenarios = scenariosData.results
    .filter(p => prop(p, 'visible', 'checkbox'))
    .map(p => ({
      label:    prop(p, 'label', 'title'),
      category: prop(p, 'category', 'select'),
      sub_type: prop(p, 'sub_type'),
      emotion:  prop(p, 'emotion', 'select'),
      risk:     prop(p, 'risk', 'select'),
      reply:    prop(p, 'reply'),
      order:    prop(p, 'order', 'number'),
    }))
    .sort((a, b) => a.order - b.order);

  const quizQuestions = quizData.results
    .filter(p => prop(p, 'visible', 'checkbox'))
    .map(p => ({
      question: prop(p, 'question', 'title'),
      order:    prop(p, 'order', 'number'),
    }))
    .sort((a, b) => a.order - b.order);

  const principles = principlesData.results
    .map(p => ({
      title: prop(p, 'title', 'title'),
      desc:  prop(p, 'desc'),
      order: prop(p, 'order', 'number'),
    }))
    .sort((a, b) => a.order - b.order);

  const results = resultsData.results.reduce((acc, p) => {
    const key = prop(p, 'key', 'title');
    acc[key] = {
      from_val:  prop(p, 'from_val'),
      to_val:    prop(p, 'to_val'),
      label:     prop(p, 'label'),
      note:      prop(p, 'note'),
      start_num: prop(p, 'start_num', 'number'),
      end_num:   prop(p, 'end_num', 'number'),
    };
    return acc;
  }, {});

  console.log('✅ 資料讀取完成');
  console.log(`   頁面設定: ${Object.keys(pages).length} 筆`);
  console.log(`   AI 情境: ${scenarios.length} 筆`);
  console.log(`   診斷題目: ${quizQuestions.length} 筆`);

  // 產生 JSON 資料檔（嵌入 HTML）
  const dataJson = JSON.stringify({ pages, scenes, scenarios, quizQuestions, principles, results }, null, 0);

  // 讀取模板
  const templatePath = path.join(__dirname, 'template.html');
  if (!fs.existsSync(templatePath)) {
    console.error('❌ 找不到 template.html，請確認檔案存在');
    process.exit(1);
  }
  let html = fs.readFileSync(templatePath, 'utf-8');

  // 注入資料
  html = html.replace('/* __NOTION_DATA__ */', `const NOTION_DATA = ${dataJson};`);

  // 輸出
  const outPath = path.join(__dirname, 'index.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  console.log(`✅ index.html 產生完成 (${Math.round(fs.statSync(outPath).size / 1024)}KB)`);
  console.log('🚀 GitHub Actions 將自動部署到 GitHub Pages');
}

build().catch(err => {
  console.error('❌ Build 失敗:', err.message);
  process.exit(1);
});
