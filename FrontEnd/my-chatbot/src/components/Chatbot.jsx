import React, { useState, useRef, useEffect } from 'react';

const Chatbot = () => {
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'bot', message: 'Hi there! 👋 I\'m your FIU (Final International University) assistant. I can help you with information about the university, programs, tuition, campus facilities, and more. What would you like to know?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // API call to your backend
  const callBackendAPI = async (question) => {
    try {
      const response = await fetch('http://localhost:3000/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ question }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Backend API Error:', error);
      throw error;
    }
  };

  // Format the bot response for better display
  const formatBotResponse = (rawResponse) => {
    if (!rawResponse) return "Sorry, I couldn't process your request.";
    
    // If response contains "Answer:" prefix, extract just the answer part
    let formattedResponse = rawResponse;
    if (formattedResponse.includes('Answer:')) {
      formattedResponse = formattedResponse.split('Answer:')[1].trim();
    }
    
    // Format bullet points and lists
    formattedResponse = formattedResponse
      .replace(/\* /g, '• ')  // Convert asterisks to bullet points
      .replace(/- /g, '• ')   // Convert dashes to bullet points
      .replace(/\n\n+/g, '\n\n') // Normalize line breaks
      .trim();
    
    return formattedResponse;
  };

  // Extract links from response if available
  const extractLinks = (response) => {
    const links = [];
    
    // Look for various link patterns
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = response.match(urlRegex);
    
    if (matches) {
      matches.forEach(link => {
        // Clean up the link (remove trailing punctuation)
        const cleanLink = link.replace(/[.,;:!?]$/, '');
        if (cleanLink.includes('final.edu.tr')) {
          links.push(cleanLink);
        }
      });
    }
    
    // Also check for "Links:" section in response
    if (response.includes('Links:')) {
      const linksSection = response.split('Links:')[1];
      if (linksSection) {
        const linkMatches = linksSection.match(urlRegex);
        if (linkMatches) {
          linkMatches.forEach(link => {
            const cleanLink = link.replace(/[.,;:!?]$/, '');
            if (cleanLink.includes('final.edu.tr') && !links.includes(cleanLink)) {
              links.push(cleanLink);
            }
          });
        }
      }
    }
    
    return links;
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const handleSend = async () => {
    if (!question.trim() || isLoading) return;

    const userMessage = question.trim();
    setQuestion('');
    setIsLoading(true);

    // Add user's question to chat
    setChatHistory((prev) => [...prev, { sender: 'user', message: userMessage }]);

    try {
      // Call your backend API
      const response = await callBackendAPI(userMessage);
      const { answer } = response;

      // Format the response for better display
      const formattedAnswer = formatBotResponse(answer);
      const extractedLinks = extractLinks(answer);

      // Add bot's formatted answer to chat
      setChatHistory((prev) => [...prev, { 
        sender: 'bot', 
        message: formattedAnswer,
        links: extractedLinks
      }]);
    } catch (error) {
      console.error('Error calling backend:', error);
      let errorMessage = '❌ Sorry, I encountered an error while processing your request.';
      
      // Handle specific error cases
      if (error.message.includes('Failed to fetch')) {
        errorMessage = '❌ Unable to connect to the server. Please make sure the backend is running on http://localhost:3000';
      } else if (error.message.includes('500')) {
        errorMessage = '❌ Server error occurred. Please try again later.';
      }
      
      setChatHistory((prev) => [...prev, { sender: 'bot', message: errorMessage }]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 p-4 flex items-center justify-center">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-pulse animation-delay-4000"></div>
      </div>

      <div className="w-full max-w-4xl mx-auto relative">
        {/* Main chat container */}
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600/90 to-purple-600/90 backdrop-blur-sm px-8 py-6 border-b border-white/10">
            <div className="flex items-center justify-center space-x-3">
              <div className="relative">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                  <span className="text-2xl">🎓</span>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
              </div>
              <div className="text-center">
                <h1 className="text-2xl font-bold text-white">FIU Assistant</h1>
                <p className="text-white/80 text-sm">Powered by AI • Always here to help</p>
              </div>
            </div>
          </div>

          {/* Chat messages */}
          <div className="h-96 lg:h-[500px] overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-transparent to-black/5">
            {chatHistory.map((chat, idx) => (
              <div
                key={idx}
                className={`flex items-start space-x-3 animate-fadeIn ${
                  chat.sender === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
                style={{ animationDelay: `${idx * 0.1}s` }}
              >
                {/* Avatar */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  chat.sender === 'user' 
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600' 
                    : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                }`}>
                  {chat.sender === 'user' ? (
                    <span className="text-white text-lg">👤</span>
                  ) : (
                    <span className="text-white text-lg">🤖</span>
                  )}
                </div>

                {/* Message bubble */}
                <div className={`max-w-xs lg:max-w-md xl:max-w-lg ${
                  chat.sender === 'user' ? 'text-right' : 'text-left'
                }`}>
                  <div className={`inline-block px-6 py-4 rounded-2xl shadow-lg transform hover:scale-105 transition-all duration-200 ${
                    chat.sender === 'user'
                      ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-br-md'
                      : 'bg-white/90 backdrop-blur-sm text-gray-800 rounded-bl-md border border-white/20'
                  }`}>
                    <p className="text-sm lg:text-base leading-relaxed whitespace-pre-wrap">
                      {chat.message}
                    </p>
                    
                    {/* Display links if available */}
                    {chat.sender === 'bot' && chat.links && chat.links.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-600 mb-2">📎 Useful Links:</p>
                        <div className="space-y-1">
                          {chat.links.map((link, linkIdx) => (
                            <a
                              key={linkIdx}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-xs text-blue-600 hover:text-blue-800 hover:underline transition-colors duration-200 break-all"
                            >
                              🔗 {link.replace('https://www.', '').substring(0, 50)}
                              {link.length > 53 ? '...' : ''}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className={`text-xs text-white/60 mt-1 px-2 ${
                    chat.sender === 'user' ? 'text-right' : 'text-left'
                  }`}>
                    {chat.sender === 'user' ? 'You' : 'FIU Assistant'} • Just now
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-start space-x-3 animate-fadeIn">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <span className="text-white text-lg">🤖</span>
                </div>
                <div className="bg-white/90 backdrop-blur-sm rounded-2xl rounded-bl-md px-6 py-4 border border-white/20 shadow-lg">
                  <div className="flex space-x-2">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-200"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-400"></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input area */}
          <div className="p-6 bg-white/5 backdrop-blur-sm border-t border-white/10">
            <div className="flex items-end space-x-4">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message here..."
                  className="w-full px-6 py-4 bg-white/90 backdrop-blur-sm rounded-2xl border border-white/20 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none resize-none text-gray-800 placeholder-gray-500 shadow-lg transition-all duration-200 min-h-[56px] max-h-32"
                  rows="1"
                  disabled={isLoading}
                />
                <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                  Press Enter to send
                </div>
              </div>
              
              <button
                onClick={handleSend}
                disabled={!question.trim() || isLoading}
                className="flex-shrink-0 w-14 h-14 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-2xl flex items-center justify-center shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 transition-all duration-200 disabled:cursor-not-allowed disabled:transform-none"
              >
                <span className={`text-xl ${isLoading ? 'animate-pulse' : ''}`}>➤</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-white/60 text-sm">
            Powered by advanced AI • Florida International University
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }
        
        .animation-delay-200 {
          animation-delay: 0.2s;
        }
        
        .animation-delay-400 {
          animation-delay: 0.4s;
        }
        
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        
        /* Custom scrollbar */
        .overflow-y-auto::-webkit-scrollbar {
          width: 6px;
        }
        
        .overflow-y-auto::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
        }
        
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 3px;
        }
        
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }
      `}</style>
    </div>
  );
};

export default Chatbot;