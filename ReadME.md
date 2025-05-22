# 🎓 University Chatbot with Puppeteer + OpenAI

This project builds an intelligent chatbot API that answers user questions based on content from the [Final International University](https://www.final.edu.tr/) website. It searches the site, extracts webpage or PDF content (including scanned images), and responds with a relevant answer using OpenAI's GPT-4o model.

---

## 🚀 Features

- 🔍 Uses **DuckDuckGo** to search only within the university website.
- 🌐 Automatically switches pages to **English** if the user's question is in English.
- 📄 Fetches and parses **HTML pages** and **PDF files** (including scanned documents).
- 🤖 Integrates **OpenAI GPT-4o** to generate intelligent, language-matching answers.
- 📎 Returns resource links and document names in the response.

---

## 📦 Technologies Used

- **Node.js / Express** – API server
- **Puppeteer** – Browser automation for web scraping
- **Axios** – File downloads
- **fs-extra** – File system utilities
- **pdf-parse** – Text extraction from digital PDFs
- **pdf2pic** – Converts PDF pages to images for OCR
- **tesseract.js** – Optical character recognition for scanned documents
- **OpenAI API** – AI-powered language model

---

## 📁 Project Structure

.
├── index.js # Main Express server
├── .env # Stores the OpenAI API key
├── package.json # Node.js dependencies
├── temp/ # Temporary folder for downloaded PDFs and images
└── README.md # You're here


---

## ⚙️ Setup Instructions

### 1. Clone the repo
```bash
git clone https://github.com/Bilo-rm/FIU-ChatBot
cd university-chatbot

2. Install dependencies
npm install


3. Create a .env file
OPENAI_API_KEY=your_openai_key_here

4. Start the server
node index.js