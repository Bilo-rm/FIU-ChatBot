const express = require('express');
const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const pdfParse = require('pdf-parse');
const { fromPath } = require('pdf2pic');
const Tesseract = require('tesseract.js');
const cheerio = require('cheerio');
const NodeCache = require('node-cache');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Enhanced caching system - cache for 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// Enhanced configuration
const CONFIG = {
  maxLinksToProcess: 8, // Increased since we're only searching one domain
  maxContentLength: 8000,
  puppeteerTimeout: 30000,
  retryAttempts: 3,
  cacheEnabled: true,
  enhancedParsing: true,
  targetDomain: 'final.edu.tr' // Only search this domain
};

// Enhanced university keywords with more variations
const UNIVERSITY_KEYWORDS = [
  'final international university', 'fiu', 'final university', 'final üniversitesi',
  'final uluslararası üniversitesi', 'university', 'campus', 'tuition', 'fees',
  'admission', 'program', 'course', 'faculty', 'student', 'academic', 'degree',
  'bachelor', 'master', 'doctorate', 'phd', 'enrollment', 'scholarship',
  'dormitory', 'library', 'laboratory', 'girne', 'cyprus', 'kıbrıs'
];

// Enhanced content extraction with better parsing
const extractEnhancedContent = async (page, url) => {
  try {
    // Wait for content to load
    await page.waitForSelector('body', { timeout: CONFIG.puppeteerTimeout });
    
    // Extract structured content
    const content = await page.evaluate(() => {
      // Remove unwanted elements
      const unwantedSelectors = [
        'script', 'style', 'nav', 'header', 'footer', 
        '.advertisement', '.ads', '.social-media', '.menu'
      ];
      
      unwantedSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });

      // Prioritize important content areas
      const contentSelectors = [
        'main', '.main-content', '.content', 'article', 
        '.post-content', '.page-content', '#content',
        '.container', '.wrapper'
      ];

      let mainContent = '';
      
      // Try to find main content area
      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element && element.innerText.trim().length > 100) {
          mainContent = element.innerText;
          break;
        }
      }

      // Fallback to body if no main content found
      if (!mainContent) {
        mainContent = document.body.innerText;
      }

      // Clean up the text
      return mainContent
        .replace(/\s+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    });

    // Extract metadata
    const metadata = await page.evaluate(() => {
      const title = document.title || '';
      const description = document.querySelector('meta[name="description"]')?.content || '';
      const keywords = document.querySelector('meta[name="keywords"]')?.content || '';
      
      return { title, description, keywords };
    });

    return {
      content: content.slice(0, CONFIG.maxContentLength),
      metadata,
      url,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`❌ Content extraction failed for ${url}:`, error.message);
    return null;
  }
};

// Enhanced PDF processing with better OCR
const enhancedPDFProcessing = async (url, filename) => {
  const pdfPath = path.join(__dirname, 'temp', filename);
  
  try {
    // Ensure temp directory exists
    await fs.ensureDir(path.dirname(pdfPath));
    
    // Download PDF with better error handling
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 50 * 1024 * 1024 // 50MB limit
    });
    
    await fs.writeFile(pdfPath, response.data);
    
    // Try text extraction first
    const dataBuffer = await fs.readFile(pdfPath);
    const pdfData = await pdfParse(dataBuffer);
    
    let extractedText = pdfData.text;
    
    // If text extraction yields poor results, use OCR
    if (!extractedText || extractedText.trim().length < 100) {
      console.log('🔍 Running OCR for better text extraction...');
      
      const ocrOptions = {
        density: 200,
        saveFilename: 'page',
        savePath: './temp/ocr-images',
        format: 'png',
        width: 1600,
        height: 2000,
      };

      const convert = fromPath(pdfPath, ocrOptions);
      
      // Process multiple pages (up to 5)
      const maxPages = Math.min(pdfData.numpages, 3);
      let ocrText = '';
      
      for (let i = 1; i <= maxPages; i++) {
        try {
          const result = await convert(i);
          const pageOCR = await Tesseract.recognize(result.path, 'eng+tur', {
            logger: m => console.log(`OCR Page ${i}:`, m.status)
          });
          ocrText += `\n--- Page ${i} ---\n${pageOCR.data.text}`;
        } catch (pageError) {
          console.error(`❌ OCR failed for page ${i}:`, pageError.message);
        }
      }
      
      extractedText = ocrText || extractedText;
      
      // Cleanup OCR images
      await fs.remove('./temp/ocr-images').catch(() => {});
    }
    
    // Cleanup PDF file
    await fs.remove(pdfPath).catch(() => {});
    
    return {
      content: extractedText.slice(0, CONFIG.maxContentLength),
      metadata: {
        title: filename,
        pages: pdfData.numpages,
        type: 'PDF'
      },
      url,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`❌ PDF processing failed for ${url}:`, error.message);
    await fs.remove(pdfPath).catch(() => {});
    return null;
  }
};

// Direct site search - ONLY search final.edu.tr
const performDirectSiteSearch = async (page, question) => {
  // Create multiple search queries targeting only final.edu.tr
  const searchQueries = [
    `site:final.edu.tr ${question}`,
    `site:final.edu.tr "${question}"`,

  ];

  let allLinks = [];
  
  for (const query of searchQueries) {
    try {
      console.log(`🔍 Searching: ${query}`);
      
      // Use Google search with site restriction
      const googleURL = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
      await page.goto(googleURL, { waitUntil: 'networkidle2', timeout: CONFIG.puppeteerTimeout });
      
      // Wait for results
      await page.waitForSelector('div[data-ved] a h3, .yuRUbf a h3', { timeout: 10000 });
      
      const links = await page.$$eval(
        'div[data-ved] a h3, .yuRUbf a h3',
        (elements) => {
          return elements.slice(0, 5).map(el => {
            const linkElement = el.closest('a');
            return {
              url: linkElement ? linkElement.href : null,
              title: el.textContent.trim()
            };
          }).filter(link => link.url && link.url.includes('final.edu.tr'));
        }
      );
      
      allLinks.push(...links);
      
      // Small delay between searches to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`❌ Search failed for query: ${query}`, error.message);
      
      // Fallback to DuckDuckGo
      try {
        const duckURL = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
        await page.goto(duckURL, { waitUntil: 'networkidle2', timeout: CONFIG.puppeteerTimeout });
        
        await page.waitForSelector('a[data-testid="result-title-a"], a.result__a', { timeout: 10000 });
        
        const ddgLinks = await page.$$eval(
          'a[data-testid="result-title-a"], a.result__a',
          (elements) => elements.slice(0, 3).map(el => ({
            url: el.href,
            title: el.textContent.trim()
          })).filter(link => link.url.includes('final.edu.tr'))
        );
        
        allLinks.push(...ddgLinks);
      } catch (ddgError) {
        console.error(`❌ DuckDuckGo fallback also failed for: ${query}`);
      }
    }
  }

  // Remove duplicates and ensure all links are from final.edu.tr
  const uniqueLinks = allLinks
    .filter((link, index, self) => 
      index === self.findIndex(l => l.url === link.url) &&
      (link.url.includes('final.edu.tr') || 
       (link.url.includes('.pdf') && link.url.includes('final')))
    )
    .slice(0, CONFIG.maxLinksToProcess);

  console.log(`✅ Found ${uniqueLinks.length} unique links from final.edu.tr`);
  return uniqueLinks;
};

// Alternative: Direct crawling of final.edu.tr (as backup)
const crawlFinalEduTr = async (page, question) => {
  const baseDomain = 'https://final.edu.tr';
  const crawlUrls = [
    `${baseDomain}`,
    `${baseDomain}/en`,
    `${baseDomain}/en/admissions`,
    `${baseDomain}/en/academics`,
    `${baseDomain}/en/programs`,
    `${baseDomain}/en/student-life`,
    `${baseDomain}/en/fees`,
    `${baseDomain}/tr`,
    `${baseDomain}/tr/ogrenci-isci`,
    `${baseDomain}/tr/akademik`,
    `${baseDomain}/tr/programlar`
  ];

  const foundLinks = [];
  
  for (const url of crawlUrls) {
    try {
      console.log(`🕷️ Crawling: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: CONFIG.puppeteerTimeout });
      
      // Extract all internal links
      const pageLinks = await page.$$eval('a[href]', (links) => {
        return links
          .map(link => ({
            url: link.href,
            title: link.textContent.trim() || link.getAttribute('title') || ''
          }))
          .filter(link => 
            link.url.includes('final.edu.tr') && 
            link.title.length > 0 &&
            !link.url.includes('#') &&
            !link.url.includes('javascript:')
          );
      });
      
      foundLinks.push(...pageLinks);
      foundLinks.push({ url, title: await page.title() });
      
    } catch (error) {
      console.error(`❌ Failed to crawl ${url}:`, error.message);
    }
  }

  // Remove duplicates and return relevant pages
  const uniqueLinks = foundLinks
    .filter((link, index, self) => 
      index === self.findIndex(l => l.url === link.url)
    )
    .slice(0, CONFIG.maxLinksToProcess);

  return uniqueLinks;
};

// Enhanced answer generation with better prompting
const generateEnhancedAnswer = async (question, contentSources, language = 'en') => {
  const contextContent = contentSources
    .map((source, index) => `
--- Source ${index + 1}: ${source.metadata?.title || source.url} ---
URL: ${source.url}
${source.content}
    `)
    .join('\n');

  const enhancedPrompt = `You are the official AI assistant for Final International University (FIU). Your role is to provide comprehensive, accurate, and helpful information about the university using ONLY the official sources from final.edu.tr provided below.

CONTEXT FROM OFFICIAL FIU SOURCES (final.edu.tr):
${contextContent}

USER QUESTION: "${question}"

#Objective:
You are an exceptional customer support representative. Your objective is to answer questions and provide resources about Final International University (FIU) — a modern, English-medium university located in Northern Cyprus offering a wide range of undergraduate and postgraduate programs. You support both current students and prospective students by helping them navigate admissions, academics, scholarships, student life, and more.

To achieve this, follow these general guidelines:
Answer the question efficiently using accurate and official university information. Always include relevant links from FIU’s official website https://www.final.edu.tr. If a question is not clear, ask follow-up questions to clarify the user's intent.

#Style:
Your communication style should be friendly, supportive, and professional. Use:

Structured formatting, including headers and bullet points

Bold for important keywords or actions

Emojis to make responses more engaging and student-friendly (🎓📌✨)

#Other Rules:
For any user question, ALWAYS query your knowledge source (such as FIU’s website or documentation), even if you believe you know the answer.

Your response MUST be based on the information returned from that source.

If a user asks questions beyond the scope of FIU-related topics, kindly redirect them to ask something you can assist with instead.

Never provide guesses, assumptions, or outdated information.

ANSWER FORMAT:
- Start with a direct answer to the question
- Provide detailed information organized in clear sections
- Include specific data (numbers, dates, requirements, etc.) when available
- End with additional resources or contact information if relevant from final.edu.tr

If the sources from final.edu.tr don't contain enough information to fully answer the question, acknowledge this and provide what information is available from the official website, then suggest contacting the university directly.

IMPORTANT: 
- ONLY use information from final.edu.tr sources provided
- Do not make assumptions or add information not in the sources
- Extract and present ALL relevant information from the final.edu.tr sources
- Be comprehensive but well-organized
- Maintain the authoritative voice of the university

ANSWER:`;

  try {
    const response = await axios.post('http://localhost:11434/api/generate', {
      model: 'deepseek-llm:7b-chat',
      prompt: enhancedPrompt,
      stream: false,
      options: {
        temperature: 0.3,
        top_p: 0.9,
        repeat_penalty: 1.1,
        max_tokens: 2000
      }
    });

    return response.data.response;
  } catch (error) {
    console.error('❌ Error from AI model:', error.message);
    throw new Error('Failed to generate response from AI model');
  }
};

// Enhanced question validation
const validateQuestion = (question) => {
  if (!question || question.trim().length < 3) {
    return { valid: false, reason: 'Question too short' };
  }

  const isUniversityRelated = UNIVERSITY_KEYWORDS.some(keyword =>
    question.toLowerCase().includes(keyword.toLowerCase())
  );

  if (!isUniversityRelated) {
    // Check for academic/educational terms
    const academicTerms = ['study', 'education', 'learn', 'program', 'course', 'degree'];
    const hasAcademicTerms = academicTerms.some(term =>
      question.toLowerCase().includes(term)
    );

    if (!hasAcademicTerms) {
      return { 
        valid: false, 
        reason: 'Question not related to Final International University' 
      };
    }
  }

  return { valid: true };
};

// Detect question language
const detectLanguage = (text) => {
  const turkishWords = ['nedir', 'nasıl', 'ne', 'üniversite', 'öğrenci', 'ders', 'fakülte'];
  const turkishWordCount = turkishWords.filter(word => 
    text.toLowerCase().includes(word)
  ).length;
  
  return turkishWordCount > 0 ? 'tr' : 'en';
};

// Main endpoint with enhanced processing - FINAL.EDU.TR ONLY
app.post('/ask', async (req, res) => {
  const { question } = req.body;
  const startTime = Date.now();
  
  console.log('🔍 Question received:', question);
  console.log('🎯 Searching ONLY final.edu.tr domain');

  // Validate question
  const validation = validateQuestion(question);
  if (!validation.valid) {
    return res.json({
      answer: "❌ Please ask a question related to Final International University (FIU). I can help you with information about admissions, programs, fees, campus life, and more using official information from final.edu.tr.",
      processingTime: Date.now() - startTime
    });
  }

  // Check cache first
  const cacheKey = `fiu_final_only_${Buffer.from(question.toLowerCase()).toString('base64')}`;
  if (CONFIG.cacheEnabled) {
    const cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      console.log('✅ Returning cached result');
      return res.json({
        ...cachedResult,
        cached: true,
        processingTime: Date.now() - startTime
      });
    }
  }

  let browser;
  try {
    // Launch browser with optimized settings
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--lang=en-US,en'
      ],
      timeout: CONFIG.puppeteerTimeout
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
    await page.setViewport({ width: 1920, height: 1080 });

    // Search ONLY final.edu.tr
    console.log('🔎 Performing direct site search on final.edu.tr...');
    let searchResults = await performDirectSiteSearch(page, question);
    
    // If no results from search, try direct crawling
    if (searchResults.length === 0) {
      console.log('🕷️ No search results found, trying direct crawling...');
      searchResults = await crawlFinalEduTr(page, question);
    }
    
    console.log('🔗 Found links from final.edu.tr:', searchResults.length);

    if (searchResults.length === 0) {
      await browser.close();
      return res.json({
        answer: "❌ I couldn't find specific information about your question on the official Final International University website (final.edu.tr). Please try rephrasing your question or contact the university directly at +90 392 630 1000 or info@final.edu.tr for assistance.",
        processingTime: Date.now() - startTime
      });
    }

    // Process content sources from final.edu.tr ONLY
    const contentSources = [];
    for (const result of searchResults) {
      console.log('📄 Processing final.edu.tr page:', result.url);
      
      // Double-check that URL is from final.edu.tr
      if (!result.url.includes('final.edu.tr') && !result.url.includes('final')) {
        console.log('⚠️ Skipping non-final.edu.tr URL:', result.url);
        continue;
      }
      
      let source = null;
      if (result.url.endsWith('.pdf')) {
        const filename = `temp_${Date.now()}_${path.basename(result.url)}`;
        source = await enhancedPDFProcessing(result.url, filename);
      } else {
        source = await extractEnhancedContent(page, result.url);
      }

      if (source && source.content.trim().length > 50) {
        contentSources.push(source);
        console.log(`✅ Content extracted from final.edu.tr (${source.content.length} chars)`);
      }
    }

    await browser.close();

    if (contentSources.length === 0) {
      return res.json({
        answer: "❌ I couldn't extract meaningful content from the available final.edu.tr sources. Please try asking a more specific question about Final International University or contact the university directly at +90 392 630 1000.",
        processingTime: Date.now() - startTime
      });
    }

    // Detect language and generate answer
    const language = detectLanguage(question);
    console.log('🤖 Generating answer using final.edu.tr content...');
    const answer = await generateEnhancedAnswer(question, contentSources, language);

    // Prepare response with final.edu.tr sources only
    const response = {
      answer: answer.trim(),
      sources: contentSources.map(s => ({
        title: s.metadata?.title || path.basename(s.url),
        url: s.url,
        type: s.metadata?.type || 'webpage',
        domain: 'final.edu.tr'
      })),
      processingTime: Date.now() - startTime,
      cached: false,
      sourceRestriction: 'Information extracted exclusively from final.edu.tr'
    };

    // Cache the result
    if (CONFIG.cacheEnabled) {
      cache.set(cacheKey, response);
    }

    console.log(`✅ Response generated from final.edu.tr in ${response.processingTime}ms`);
    res.json(response);

  } catch (error) {
    console.error('❌ Error processing request:', error.message);
    
    if (browser) {
      await browser.close().catch(() => {});
    }

    res.status(500).json({
      answer: "❌ I encountered an error while processing your question from final.edu.tr. Please try again in a moment or contact the university directly.",
      error: error.message,
      processingTime: Date.now() - startTime
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    targetDomain: CONFIG.targetDomain,
    cacheStats: cache.getStats()
  });
});

// Cache management endpoints
app.post('/cache/clear', (req, res) => {
  cache.flushAll();
  res.json({ message: 'Cache cleared successfully' });
});

app.get('/cache/stats', (req, res) => {
  res.json(cache.getStats());
});

app.listen(3000, () => {
  console.log('🚀 Enhanced FIU AI Assistant running at http://localhost:3000');
  console.log('🎯 SOURCE RESTRICTION: Only extracting information from final.edu.tr');
  console.log('📊 Cache enabled:', CONFIG.cacheEnabled);
  console.log('🔧 Max links to process:', CONFIG.maxLinksToProcess);
});

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  cache.flushAll();
  process.exit(0);
});