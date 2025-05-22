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

  // Get first 2 links instead of just the first
  const links = await page.$$eval(
    'a.result__a, a[data-testid="result-title-a"]',
    (elements) => elements.slice(0, 2).map(el => el.href)
  );
  console.log('🔗 Top 2 links:', links);

  let combinedContent = '';
  let resources = [];

  for (const link of links) {
    let contentToSend = '';
    let sourceType = 'web';

    if (link.endsWith('.pdf')) {
      console.log('📄 PDF detected:', link);
      try {
        const pdfPath = await downloadPDF(link);
        contentToSend = await extractTextFromPDF(pdfPath);
        if (!contentToSend.trim()) {
          console.log('🔍 PDF is likely scanned. Running OCR...');
          contentToSend = await extractOCRTextFromPDF(pdfPath);
          sourceType = 'ocr';
        }
        resources.push(`PDF: ${path.basename(link)}`);
        await fs.remove(pdfPath);
        await fs.remove('./ocr-images');
      } catch (err) {
        console.error('❌ PDF handling failed:', err);
        continue;
      }
    } else {
      console.log('🌐 Webpage detected:', link);
      try {
        await page.goto(link, { waitUntil: 'networkidle2' });
        

        
        contentToSend = await page.evaluate(() => document.body.innerText);
        resources.push(`Page: ${await page.title()}`);
      } catch (err) {
        console.error('❌ Page handling failed:', err);
        continue;
      }
    }

    combinedContent += `\n\n--- Source: ${link} ---\n${contentToSend}`;
    console.log(`📤 Content (${sourceType}) from ${link}. Truncated:\n`, contentToSend.slice(0, 200), '...');
  }

  await browser.close();

  const prompt = `
You are a university chatbot. Use the following content from multiple sources to answer the question:
${combinedContent}
---
Answer the question: "${question}"
Respond in the same language used in the question.
Combine information from different sources when relevant.
Format:
Answer: ... (combine information if needed)
Resources: ${resources.join(', ')}
Links: ${links.join(', ')}
`;

  // Rest of your OpenAI code remains the same...
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'You are a helpful assistant that answers university-related questions.' },
      { role: 'user', content: prompt }
    ],
  });

  const answer = completion.choices[0].message.content;
  console.log('✅ GPT Answer:', answer);

  res.json({ answer });
});

app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
