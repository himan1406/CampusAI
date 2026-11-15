import { z } from 'zod';

export const validators = {
  get_courses: z.object({}).strict(),
  get_upcoming_events: z.object({ start_date: z.string().optional(), end_date: z.string().optional(), course_name: z.string().max(160).optional(), limit: z.number().int().min(1).max(40).optional() }).strict(),
  search_course_materials: z.object({ query: z.string().min(1).max(1000), course_name: z.string().max(160).optional(), limit: z.number().int().min(1).max(8).optional() }).strict(),
  search_emails: z.object({ query: z.string().min(1).max(1000), provider: z.enum(['gmail', 'outlook']).optional(), limit: z.number().int().min(1).max(10).optional() }).strict(),
  get_recent_emails: z.object({ provider: z.enum(['gmail', 'outlook']).optional(), limit: z.number().int().min(1).max(15).optional() }).strict(),
  get_email_thread: z.object({ provider: z.enum(['gmail', 'outlook']), provider_thread_id: z.string().min(1).max(500), limit: z.number().int().min(1).max(10).optional() }).strict(),
  search_attachments: z.object({ query: z.string().min(1).max(1000), limit: z.coerce.number().int().min(1).max(8).optional() }).strict(),
  read_attachment: z.object({ file_name: z.string().max(200).optional(), part: z.coerce.number().int().min(1).max(200).optional() }).strict()
};
