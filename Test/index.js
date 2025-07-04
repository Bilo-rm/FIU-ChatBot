const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const { fromPath } = require('pdf2pic');
const Tesseract = require('tesseract.js');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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

  // Filter unrelated questions (optional)
  const universityKeywords = ['final international university', 'fiu', 'university', 'campus', 'tuition', 'fees','final uluslararası üniversitesi'];
  const isUniversityRelated = universityKeywords.some(keyword =>
    question.toLowerCase().includes(keyword)
  );
  if (!isUniversityRelated) {
    return res.json({
      answer: "❌ Your question seems unrelated to the university. Please ask something about the university."
    });
  }

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
          console.log('🔍 PDF likely scanned. Running OCR...');
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
You are a helpful assistant for Final International University (FIU). Your task is to provide direct, specific answers to user questions using the information from the university's official sources below.

Content from official FIU sources:
${combinedContent}
---
User Question: "${question}"

Instructions:
- Extract and provide the SPECIFIC information that answers the user's question
- Be direct and factual - don't say "the content doesn't specify" 
- If you find partial information, provide what you know and indicate what additional details might be available
- Focus on giving actionable information rather than deflecting to other sources
- Only mention checking additional sources if the user needs more comprehensive details beyond what you can provide

Response Format:
[✔ Provide a clear and direct answer using the official content.]
[📎 If there are relevant files or links, provide them here clearly.]
[ℹ️ For additional details or the most current information, you can visit: ${links.join(' or ')}]

Sources: ${resources.join(', ')}
`;
  


  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'qwen2.5:3b',
      prompt: prompt,
      stream: false
    });
    const answer = response.data.response;
    console.log('✅ DeepSeek Answer:', answer);
    res.json({ answer });
  } catch (error) {
    console.error('❌ Error from DeepSeek:', error);
    res.status(500).json({ error: 'Failed to get response from DeepSeek model.' });
  }
});


app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
