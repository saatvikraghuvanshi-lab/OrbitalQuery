import { Request, Response, NextFunction } from 'express';

/**
 * Characters that could be used for injection attacks
 */
const DANGEROUS_PATTERNS = [
  /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|TRUNCATE)\b)/i,
  /(;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE)\s)/i,
  /(--\s)|(\s--)|(\|)|(\$)/,
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
];

/**
 * Maximum allowed query length
 */
const MAX_QUERY_LENGTH = 500;

/**
 * Maximum allowed field lengths
 */
const FIELD_LIMITS: Record<string, number> = {
  query: 500,
  provider: 100,
  collection: 100,
  startDate: 30,
  endDate: 30,
};

/**
 * Strip potentially dangerous characters while keeping useful ones
 */
function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets (XSS)
    .replace(/['"]/g, '') // Remove quotes (SQL injection)
    .replace(/\\/g, '')   // Remove backslashes
    .trim();
}

/**
 * Check if a string contains injection patterns
 */
function containsDangerousPattern(input: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Validate bounding box coordinates
 */
function isValidBbox(bbox: any): boolean {
  if (!Array.isArray(bbox) || bbox.length !== 4) return false;
  const [west, south, east, north] = bbox;
  return (
    typeof west === 'number' && typeof south === 'number' &&
    typeof east === 'number' && typeof north === 'number' &&
    west >= -180 && west <= 180 &&
    south >= -90 && south <= 90 &&
    east >= -180 && east <= 180 &&
    north >= -90 && north <= 90 &&
    west < east && south < north
  );
}

/**
 * Validate date strings
 */
function isValidDate(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && date.getFullYear() >= 1970 && date.getFullYear() <= 2100;
}

/**
 * Sanitize request body fields for search API
 */
export function sanitizeSearchQuery(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  // Sanitize query string
  if (body.query) {
    if (typeof body.query !== 'string') {
      res.status(400).json({ error: 'Query must be a string' });
      return;
    }

    if (body.query.length > MAX_QUERY_LENGTH) {
      res.status(400).json({ error: `Query too long (max ${MAX_QUERY_LENGTH} characters)` });
      return;
    }

    if (containsDangerousPattern(body.query)) {
      res.status(400).json({ error: 'Query contains potentially dangerous content' });
      return;
    }

    body.query = sanitizeString(body.query);
  }

  // Sanitize string fields
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    if (body[field] && typeof body[field] === 'string') {
      body[field] = sanitizeString(body[field]).substring(0, limit);
    }
  }

  // Validate bounding box
  if (body.bbox && !isValidBbox(body.bbox)) {
    res.status(400).json({ error: 'Invalid bounding box. Format: [west, south, east, north]' });
    return;
  }

  // Validate dates
  if (body.startDate && !isValidDate(body.startDate)) {
    res.status(400).json({ error: 'Invalid startDate format. Use ISO 8601 (YYYY-MM-DD)' });
    return;
  }
  if (body.endDate && !isValidDate(body.endDate)) {
    res.status(400).json({ error: 'Invalid endDate format. Use ISO 8601 (YYYY-MM-DD)' });
    return;
  }

  // Validate limit
  if (body.limit !== undefined) {
    body.limit = Math.min(Math.max(parseInt(body.limit) || 20, 1), 100);
  }

  // Validate offset
  if (body.offset !== undefined) {
    body.offset = Math.max(parseInt(body.offset) || 0, 0);
  }

  next();
}

/**
 * Sanitize request body for auth endpoints
 */
export function sanitizeAuthInput(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  // Email validation
  if (body.email) {
    if (typeof body.email !== 'string') {
      res.status(400).json({ error: 'Email must be a string' });
      return;
    }
    body.email = body.email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }
  }

  // Password validation
  if (body.password) {
    if (typeof body.password !== 'string') {
      res.status(400).json({ error: 'Password must be a string' });
      return;
    }
    if (body.password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }
    if (body.password.length > 128) {
      res.status(400).json({ error: 'Password too long (max 128 characters)' });
      return;
    }
  }

  // Name validation
  if (body.name && typeof body.name === 'string') {
    body.name = sanitizeString(body.name).substring(0, 100);
  }

  next();
}
