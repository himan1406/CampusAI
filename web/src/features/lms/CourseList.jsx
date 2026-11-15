import React from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { formatDate } from './lms-utils.js';

export default function CourseList({ courses, courseSearch, onCourseSearchChange }) {
  return <>
    <div className="lms-library-top lms-course-toolbar">
      <div><h2>My courses</h2><p>{courses.length} courses synchronized from your enrolments.</p></div>
      <input className="lms-search" value={courseSearch} onChange={event => onCourseSearchChange(event.target.value)} placeholder="Search your courses…"/>
    </div>
    <div className="lms-course-grid">
      {courses.length ? courses.map(course => <article className="lms-course-card" key={course.id}>
        <div className="lms-course-card-icon"><BookOpen size={19}/></div>
        <div className="lms-course-card-body">
          <h3>{course.title}</h3>
          <span>{course.metadata?.shortname || course.metadata?.idnumber || 'BennettTech course'}</span>
          {course.content_text && <p>{course.content_text.slice(0, 240)}{course.content_text.length > 240 ? '…' : ''}</p>}
          <div className="lms-course-dates">
            {Number(course.startdate) > 0 && <span>Starts {formatDate(course.startdate)}</span>}
            {Number(course.enddate) > 0 && <span>Ends {formatDate(course.enddate)}</span>}
          </div>
          <a href={course.source_url} target="_blank" rel="noreferrer">Open course in iLearn <ExternalLink size={13}/></a>
        </div>
      </article>) : <EmptyState className="lms-empty" icon={BookOpen} title="No courses found" text="Run Sync iLearn to retrieve your enrolled courses. If the list is empty, check whether the Moodle token can access the enrolment service."/>}
    </div>
  </>;
}
