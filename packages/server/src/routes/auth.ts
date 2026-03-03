import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { signToken, authGuard } from '../middleware/auth.js';
import { registerSchema, loginSchema } from '@nba-gm/shared';

const isProd = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' as const : 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days
};

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', message: parsed.error.message });
    }

    const { email, password, displayName } = parsed.data;

    try {
      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) {
        return reply.status(409).send({ error: 'Conflict', message: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const [user] = await db.insert(users).values({ email, passwordHash, displayName }).returning();

      const token = signToken({ userId: user.id, email: user.email });

      reply.setCookie('token', token, cookieOptions);

      return { data: { id: user.id, email: user.email, displayName: user.displayName }, token };
    } catch (err) {
      app.log.error(err, 'Registration failed');
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Registration failed. Please try again.' });
    }
  });

  app.post('/api/auth/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation error', message: parsed.error.message });
    }

    const { email, password } = parsed.data;

    try {
      const [user] = await db.select().from(users).where(eq(users.email, email));
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Unauthorized', message: 'Invalid credentials' });
      }

      const token = signToken({ userId: user.id, email: user.email });

      reply.setCookie('token', token, cookieOptions);

      return { data: { id: user.id, email: user.email, displayName: user.displayName }, token };
    } catch (err) {
      app.log.error(err, 'Login failed');
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Login failed. Please try again.' });
    }
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { data: { message: 'Logged out' } };
  });

  app.get('/api/auth/me', { preHandler: authGuard }, async (request, reply) => {
    try {
      const [user] = await db.select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
      }).from(users).where(eq(users.id, request.user!.userId));
      return { data: user };
    } catch (err) {
      app.log.error(err, 'Failed to fetch user');
      return reply.status(500).send({ error: 'Internal Server Error', message: 'Failed to fetch user.' });
    }
  });
}
