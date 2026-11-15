import React from 'react';
import { Bot, MessageSquare, UserRound } from 'lucide-react';

export default function ChatMessages({ messages, busy, endRef, onPrompt }) {
  return <div className="chat-messages">
    {messages.length ? messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.created_at || index}-${index}`}><div className="chat-avatar">{message.role === 'assistant' ? <Bot size={16}/> : <UserRound size={16}/>}</div><div><strong>{message.role === 'assistant' ? 'Campus AI' : 'You'}</strong><p>{message.content || (busy && index === messages.length - 1 ? 'Thinking…' : '')}</p></div></div>) : <div className="chat-welcome"><div className="ai-symbol"><MessageSquare size={20}/></div><h2>How can I help today?</h2><p>Ask about your iLearn courses, study materials, calendar and synchronized inboxes, or attach a PDF, Word or PowerPoint file with the paperclip. Campus AI selects the relevant tools for each question.</p><div className="prompt-chips"><button onClick={() => onPrompt('Help me plan my study week.')}>Plan my study week</button><button onClick={() => onPrompt('Explain how to prepare for semester exams.')}>Prepare for exams</button><button onClick={() => onPrompt('Help me prioritize my assignments.')}>Prioritize assignments</button></div></div>}
    <div ref={endRef}/>
  </div>;
}
