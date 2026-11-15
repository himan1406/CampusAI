import { z } from 'zod';

export const emailSchema = z.string().trim().email({ message: 'Enter a valid email address' }).max(254).transform(v => v.toLowerCase());

export function normalizeIndianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const localNumber = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(localNumber) ? `+91${localNumber}` : '';
}

export const phoneSchema = z.string().trim().transform(normalizeIndianPhone).refine(
  value => Boolean(value),
  { message: 'Enter a valid 10-digit Indian mobile number (6–9 first digit)' }
);

export const signupSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: emailSchema,
  phone_number: phoneSchema,
  password: z.string().min(12).max(128),
  student_id: z.string().trim().max(60).optional().nullable(),
  department: z.string().trim().max(100).optional().nullable(),
  academic_year: z.number().int().min(1).max(8).optional().nullable()
});

export const loginSchema = z.object({ email: emailSchema, phone_number: phoneSchema, password: z.string().min(1).max(128) });

export const refreshSchema = z.object({ refresh_token: z.string().min(20).max(200) });

export const credentialSchema = z.object({
  platform: z.enum(['mycamu', 'lms']),
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(512)
});
