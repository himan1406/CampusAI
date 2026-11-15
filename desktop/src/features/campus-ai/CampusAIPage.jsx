import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Mic, Plus, Paperclip, LoaderCircle, UserRound } from 'lucide-react';

export default function CampusAIPage({ onNavigate }) {
  const [messages, setMessages] = useState([
    {
      id: 'ai-0',
      role: 'assistant',
      content: 'How can I help today? Ask about your iLearn courses, study materials, calendar and synchronized inboxes, or attach a PDF, Word or PowerPoint file with the paperclip.',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef(null);
  const formRef = useRef(null);
  
  // Initialize Web Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Fallback if no speech recognition
      return;
    }
    
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'en-US';
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    
    recognitionRef.current.onstart = () => {
      setIsListening(true);
    };
    
    recognitionRef.current.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      recognitionRef.current.stop();
      setIsListening(false);
      processUserInput(transcript);
    };
    
    recognitionRef.current.onerror = (event) => {
      setIsListening(false);
      recognitionRef.current.stop();
    };
    
    recognitionRef.current.onend = () => {
      if (isListening) {
        setIsListening(false);
      }
    };
  }, []);
  
  const processUserInput = async (message) => {
    if (!message.trim()) return;
    
    // Add user message
    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);
    
    try {
      // Send to API
      const res = await fetch('/api/v1/chat/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const sessionData = await res.json();
      
      if (!res.ok || !sessionData.id) {
        throw new Error('Failed to create chat session');
      }
      
      const sessionId = sessionData.id;
      
      // Get SSE stream
      const answerRes = await fetch(`/api/v1/chat/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${window.electron.store.get('accessToken')}`
        },
        body: JSON.stringify({ message })
      });
      
      // Process SSE stream
      if (answerRes.body) {
        const reader = answerRes.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const text = decoder.decode(value);
            // Parse SSE events
            const lines = text.split('\n').filter(line => line.trim());
            for (const line of lines) {
              if (line.startsWith('data:')) {
                try {
                  const event = JSON.parse(line.substring(5).trim());
                  handleSSEEvent(event);
                } catch (e) {
                  console.error('Failed to parse SSE event:', e);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error processing input:', err);
      addMessage({ role: 'assistant', content: `Sorry, I encountered an error: ${err.message}`, timestamp: new Date() });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleSSEEvent = (event) => {
    switch (event.type) {
      case 'answer':
        // Add the text to the latest assistant message
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [
              ...prev.slice(0, -1),
              { ...last, content: last.content + (event.text || '') }
            ];
          }
          return prev;
        });
        break;
        
      case 'tool.start':
        // A tool is starting - could show typing indicator
        break;
        
      case 'tool.done':
        // A tool finished
        break;
        
      case 'message.sources':
        // Sources available
        break;
        
      default:
        break;
    }
  };
  
  const addMessage = (msg) => {
    setMessages(prev => [...prev, msg]);
  };
  
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    processUserInput(input);
  };
  
  const startListening = () => {
    if (!recognitionRef.current) return;
    setIsListening(true);
    setInput('');
    recognitionRef.current.start();
  };
  
  const handleKeyDown = (e) => {
    // Handle attachment click, etc.
  };
  
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      fontFamily: 'var(--font)'
    }}>
      <header style={{
        padding: 20,
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UserRound style={{ width: 32, height: 32, borderRadius: 50, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: '#6b7482' }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: '#14181f' }}>Campus AI</span>
        </div>
        <Plus style={{ width: 24, height: 24, color: '#fff', background: '#3b51d3', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
      </header>
      
      <section style={{ padding: 20, flexGrow: 1, overflowY: 'auto' }}>
        <div style={{ height: 100, marginBottom: 20 }}>
          {/* Chat messages area */}
          {messages.map((msg) => (
            <div key={msg.id} style={{
              marginBottom: 16,
              maxWidth: '80%',
              wordBreak: 'break-word'
            }}>
              <div style={{
                marginBottom: 4,
                display: 'flex',
                alignItems: 'flex-start'
              }}>
                {msg.role === 'assistant' && (
                  <MessageSquare style={{ width: 24, height: 24, color: '#fff', background: '#3b51d3', borderRadius: 8, flexShrink: 0, marginRight: 8, flexShrink: 0 }} />
                )}
                {msg.role === 'user' && (
                  <div style={{ width: 24, height: 24, borderRadius: 8, background: '#3b51d3', color: '#fff', flexShrink: 0, marginRight: 8 }} />
                )}
                <div style={{ fontSize: 13, lineHeight: 1.5, color: '#14181f' }}>
                  {msg.content}
                </div>
                {msg.timestamp && (
                  <span style={{ fontSize: 10, color: '#6b7482', marginLeft: 8, marginTop: 2 }}>{msg.timestamp.toLocaleTimeString()}</span>
                )}
              </div>
            </div>
          ))}
          
          {/* Assistant initial state or streaming area */}
          {isProcessing && messages.length === 1 && messages[0].role === 'assistant' && messages[0].content === 'How can I help today?' && {
            // Show thinking indicator while processing
          }}
        </div>
      </section>
      
      <section style={{ padding: '0 20px 20px', borderTop: '1px solid var(--border)', background: '#fff' }}>
        <form onSubmit={handleKeyDown} style={{ display: 'flex', gap: 8, padding: 12, borderRadius: 8, background: 'var(--surface-2)' }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend(e)}
            placeholder="Message Campus AI..."
            style={{
              flexGrow: 1,
              border: 'none',
              background: 'transparent',
              fontSize: 13,
              color: '#14181f',
              fontFamily: 'var(--font)'
            }}
          />
          <button
            type="submit"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              background: '#3b51d3',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            {isListening ? (
              <LoaderCircle style={{ width: 18, height: 18, color: '#fff' }} />
            ) : (
              <Paperclip style={{ width: 18, height: 18, color: '#fff' }} />
            )}
          </button>
        </form>
      </section>
    </div>
  );
}