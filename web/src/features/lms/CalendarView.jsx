import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { dateKey, eventDate, formatTime } from './lms-utils.js';

export default function CalendarView({ events, month, monthLabel, calendarDays, eventsByDay, selectedDay, selectedEvents, onChangeMonth, onSelectDay, onToday }) {
  return <>
    <div className="lms-calendar-toolbar">
      <div><h2>iLearn calendar</h2><p>Events returned by the Moodle calendar service.</p></div>
      <div className="lms-calendar-nav">
        <button className="secondary-btn" onClick={() => onChangeMonth(-1)} aria-label="Previous month"><ChevronLeft size={16}/></button>
        <strong>{monthLabel}</strong>
        <button className="secondary-btn" onClick={() => onChangeMonth(1)} aria-label="Next month"><ChevronRight size={16}/></button>
        <button className="text-link" onClick={onToday}>Today</button>
      </div>
    </div>
    <div className="lms-calendar-grid">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div className="lms-calendar-weekday" key={day}>{day}</div>)}
      {calendarDays.map(day => {
        const key = dateKey(day);
        const dayEvents = eventsByDay.get(key) || [];
        const inMonth = day.getMonth() === month.getMonth();
        return <button
          type="button"
          key={key}
          className={`lms-calendar-day ${inMonth ? '' : 'outside'} ${selectedDay === key ? 'selected' : ''} ${key === dateKey(new Date()) ? 'today' : ''}`}
          onClick={() => onSelectDay(key)}
        >
          <span className="lms-day-number">{day.getDate()}</span>
          {dayEvents.slice(0, 2).map(event => <span className="lms-day-event" key={event.id}>{event.title}</span>)}
          {dayEvents.length > 2 && <span className="lms-day-more">+{dayEvents.length - 2} more</span>}
        </button>;
      })}
    </div>
    <div className="lms-selected-events">
      <div className="lms-selected-events-head">
        <div><h3>{new Date(`${selectedDay}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h3><p>{selectedEvents.length} events</p></div>
      </div>
      {selectedEvents.length ? selectedEvents.map(event => {
        const date = eventDate(event);
        return <article className="lms-event-row" key={event.id}>
          <div className="lms-event-time"><Clock3 size={14}/><span>{formatTime(date)}</span></div>
          <div className="lms-event-copy">
            <strong>{event.title}</strong>
            <span>{event.course_name || 'iLearn calendar'}</span>
            {event.content_text && <p>{event.content_text.slice(0, 220)}</p>}
            <a href={event.source_url} target="_blank" rel="noreferrer">Open in iLearn <ExternalLink size={12}/></a>
          </div>
        </article>;
      }) : <EmptyState className="lms-empty lms-empty-compact" size={24} icon={CalendarDays} title="No events on this date" text="Choose another date or sync iLearn again."/>}
    </div>
    {!events.length && <EmptyState className="lms-empty" icon={CalendarDays} title="No calendar events returned" text="The Moodle calendar service may not have returned events for the selected range, or the account may not have visible events."/>}
  </>;
}
