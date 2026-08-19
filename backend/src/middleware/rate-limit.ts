import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter: 100 requests per 15 minutes per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'You have exceeded 100 requests in 15 minutes. Please try again later.',
  },
});

/**
 * Search-specific rate limiter: 30 searches per 5 minutes per IP
 */
export const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Search rate limit exceeded',
    message: 'You have exceeded 30 searches in 5 minutes. Please wait.',
  },
});

/**
 * Auth rate limiter: 10 login attempts per 15 minutes per IP
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts',
    message: 'You have exceeded 10 login attempts in 15 minutes.',
  },
});

/**
 * Ingestion rate limiter: 5 requests per hour
 */
export const ingestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Ingestion rate limit exceeded',
    message: 'You have exceeded 5 ingestion requests per hour.',
  },
});
