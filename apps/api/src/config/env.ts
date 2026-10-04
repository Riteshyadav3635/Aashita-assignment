import 'dotenv/config';
import { z } from 'zod';

const rawEnv = {
  ...process.env,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET ?? 'dev-secret-key-must-be-replaced-123456',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-key-must-be-replaced-123456',
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters long'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters long'),
  DATABASE_URL: z.string().default('postgresql://app:app@localhost:5432/app?schema=public'),
  TEST_DATABASE_URL: z.string().default('postgresql://app:app@localhost:5432/app_test?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  API_URL: z.string().default('http://localhost:4000'),
  SOCKET_URL: z.string().default('http://localhost:4000'),
  APP_NAME: z.string().default('workspace'),
  APP_VERSION: z.string().default('0.1.0'),
});

export const env = envSchema.parse(rawEnv);

if (env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) {
  throw new Error('FRONTEND_URL must be set when NODE_ENV=production');
}
