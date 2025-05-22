const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const { fromPath } = require('pdf2pic');
const Tesseract = require('tesseract.js');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const downloadPDF = async (url, filename = 'document.pdf') => {
  const pdfPath = path.join(__dirname, filename);
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  await fs.writeFile(pdfPath, response.data);
  return pdfPath;
};

const extractTextFromPDF = async (pdfPath) => {
  const dataBuffer = await fs.readFile(pdfPath);
  const data = await pdfParse(dataBuffer);
  return data.text;
};

const extractOCRTextFromPDF = async (pdfPath) => {
  const options = {
    density: 150,
    saveFilename: 'page',
    savePath: './ocr-images',
    format: 'png',
    width: 1200,
    height: 1600,
  };

  const convert = fromPath(pdfPath, options);
  const result = await convert(1); // Convert only the first page
  const ocrResult = await Tesseract.recognize(result.path, 'eng');
  return ocrResult.data.text;
};

app.post('/ask', async (req, res) => {
  const question = req.body.question;
  console.log('🔍 Question received:', question);

  const browser = await puppeteer.launch({
    headless: false,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--lang=en-US,en'],
  });

  const page = await browser.newPage();
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });

  const searchQuery = `site:https://www.final.edu.tr/ ${question}`;
  const duckURL = `https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}`;
  console.log('🔎 Searching:', duckURL);

  await page.goto(duckURL, { waitUntil: 'networkidle2' });
  await page.waitForSelector('a.result__a, a[data-testid="result-title-a"]');

  const firstLink = await page.$eval('a.result__a, a[data-testid="result-title-a"]', el => el.href);
  console.log('🔗 First result link:', firstLink);

  let contentToSend = '';
  let sourceType = 'web';

  if (firstLink.endsWith('.pdf')) {
    console.log('📄 PDF detected, downloading...');
    try {
      const pdfPath = await downloadPDF(firstLink);
      contentToSend = await extractTextFromPDF(pdfPath);
      if (!contentToSend.trim()) {
        console.log('🔍 PDF is likely scanned. Running OCR...');
        contentToSend = await extractOCRTextFromPDF(pdfPath);
        sourceType = 'ocr';
      }
      await fs.remove(pdfPath);
      await fs.remove('./ocr-images');
    } catch (err) {
      console.error('❌ PDF handling failed:', err);
    }
  } else {
    await page.goto(firstLink, { waitUntil: 'networkidle2' });
    try {
      await page.evaluate(() => {
        const enBtn = [...document.querySelectorAll('a, button')].find(el =>
          el.innerText.toLowerCase().includes('english')
        );
        if (enBtn) enBtn.click();
      });
      await page.waitForTimeout(2000);
    } catch (err) {
      console.log('⚠️ No language switch button found.');
    }
    contentToSend = await page.content();
  }

  await browser.close();
  console.log(`📤 Content (${sourceType}) sent to GPT. Truncated:\n`, contentToSend.slice(0, 500), '...');

  const prompt = `
You are a university chatbot. Use the following content to answer the question:
---
${contentToSend}
---
Answer the question: "${question}"
Respond in the same language used in the question.
Format:
Answer: ...
Link: ${firstLink}
Resources: List any documents or files mentioned.
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that answers university-related questions.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const answer = completion.choices[0].message.content;
  console.log('✅ GPT Answer:', answer);

  res.json({ answer });
});

app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
