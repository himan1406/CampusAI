import React from 'react';
import { Plus } from 'lucide-react';
import ChatMessages from './ChatMessages.jsx';
import AttachmentList from './AttachmentList.jsx';
import Composer from './Composer.jsx';
import ToolActivity from './ToolActivity.jsx';

export default function AssistantPage({
  sessions, activeSession, onOpenSession, onNewChat,
  dragging, setDragging, attachFiles,
  chatMessages, chatBusy, chatEndRef, onPrompt,
  attachments, onRemoveAttachment,
  chatInput, onChatInputChange, onSubmit, attachInputRef,
  toolActivity, chatSources
}) {
  return <>
    <section className="page-heading"><div><h1>Campus AI</h1><p>Your assistant can search your courses, course materials, calendar and synchronized inboxes using context-aware tools.</p></div><button className="secondary-btn" onClick={onNewChat}><Plus size={16}/> New chat</button></section>
    <div className="assistant-layout">
      <aside className="chat-history"><div className="history-title">Recent chats</div>{sessions.map(session => <button key={session.id} className={activeSession?.id === session.id ? 'active' : ''} onClick={() => onOpenSession(session.id)}>{session.title || 'Conversation'}</button>)}</aside>
      <section className={`chat-panel ${dragging ? 'drag-over' : ''}`} onDragOver={e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); } }} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); attachFiles(e.dataTransfer.files); }}>
        <ChatMessages messages={chatMessages} busy={chatBusy} endRef={chatEndRef} onPrompt={onPrompt}/>
        <AttachmentList attachments={attachments} onRemove={onRemoveAttachment}/>
        <Composer value={chatInput} onChange={onChatInputChange} onSubmit={onSubmit} busy={chatBusy} disabled={!activeSession} attachInputRef={attachInputRef} onAttachFiles={attachFiles}/>
        <ToolActivity tools={toolActivity} sources={chatSources}/>
        <div className="chat-disclaimer">Campus AI may make mistakes. It only uses data synchronized to your CampusOS account and documents attached to this chat; email attachments are not indexed.</div>
      </section>
    </div>
  </>;
}
