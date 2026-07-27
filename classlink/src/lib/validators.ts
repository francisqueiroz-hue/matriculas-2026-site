import { z } from "zod";

export const createClassSchema = z.object({
  name: z.string().min(1).max(100),
  year: z.number().int().min(2000).max(2100),
});

export const updateClassSchema = createClassSchema.partial();

export const createStudentSchema = z.object({
  name: z.string().min(1).max(150),
  classId: z.string().min(1),
  birthDate: z.string().datetime().optional(),
});

export const updateStudentSchema = createStudentSchema.partial();

export const linkGuardianSchema = z.object({
  guardianEmail: z.string().email(),
  guardianName: z.string().min(1).max(150),
  relation: z.string().max(50).optional(),
  password: z.string().min(8).optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "STAFF", "GUARDIAN"]),
  phone: z.string().max(30).optional(),
  classIds: z.array(z.string()).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  phone: z.string().max(30).optional(),
  active: z.boolean().optional(),
  classIds: z.array(z.string()).optional(),
});

export const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  audience: z.enum(["SCHOOL", "CLASS"]),
  classId: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(["image", "video"]).optional(),
});

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  classId: z.string().optional(), // ausente = evento para toda a escola
});

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});
