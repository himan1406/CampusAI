# BennettTech iLearn API notes

This project follows the user-provided `test_token.py` flow.

## Token exchange

`POST https://lms.bennett.edu.in/login/token.php`

Form fields:

- `username`
- `password`
- `service=moodle_mobile_app`

The backend uses the returned `token` only. It does not print or return it. The password is not stored; it is used only for this exchange.

## Verify the authenticated account

`POST https://lms.bennett.edu.in/webservice/rest/server.php`

Form fields:

- `wstoken=<encrypted token decrypted in backend memory>`
- `wsfunction=core_webservice_get_site_info`
- `moodlewsrestformat=json`

The returned `userid`, `fullname`, and `sitename` are used to verify the account.

## Enrolled courses

Function: `core_enrol_get_users_courses`

Parameter:

- `userid=<site-info userid>`

The response is normalized into course cards with name, short name, summary, start/end dates, and a same-site course URL.

## Calendar events

Function: `core_calendar_get_calendar_events`

The backend supplies the enrolled course IDs and these options:

- `options[userevents]=1`
- `options[siteevents]=1`
- `options[timestart]=<now minus 30 days>`
- `options[timeend]=<now plus 365 days>`
- `options[ignorehidden]=1`

Each course ID is encoded as `events[courseids][index]`.

Calendar events are normalized into a local event list with title, description, course association, start timestamp, duration, and an iLearn calendar link.

## Scope

Only these read operations are used. No Moodle write function is called. If the calendar function is not enabled for the `moodle_mobile_app` service or the student role, course sync still completes and CampusOS reports a calendar warning.


## Sprint 6 course-content indexing

Sprint 6 additionally attempts `core_course_get_contents` for each enrolled course (subject to `LMS_MAX_COURSES_FOR_CONTENTS`). It extracts module descriptions and inline content, then downloads supported same-origin Moodle `fileurl` resources using the existing Moodle token. The backend enforces a file-count and file-size cap (`LMS_MAX_FILES_PER_SYNC`, `LMS_MAX_FILE_MB`).

Supported extraction: PDF, DOCX, PPTX, TXT, Markdown, CSV and HTML. Scanned PDFs requiring OCR and email attachments are not indexed. If Bennett's student web-service token cannot call `core_course_get_contents` or download a course file, CampusOS records a warning and leaves the existing course/calendar sync intact. It does not attempt to bypass Moodle permissions.
