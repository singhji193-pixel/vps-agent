/**
 * Shared Authentication Module
 * 
 * Provides session management and authentication middleware
 * that can be used across different route modules.
 */

import { Request, Response, NextFunction } from "express";

// Session storage (in production, use Redis or database sessions)
export const sessions = new Map<string, { email: string; userId: string; expiresAt: Date }>();

// Middleware to check authentication
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.sessionId;
  const session = sessions.get(sessionId);
  
  if (!session || session.expiresAt < new Date()) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  
  (req as any).userId = session.userId;
  (req as any).email = session.email;
  next();
}

// Optional auth - doesn't fail if not authenticated
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.headers.authorization?.replace("Bearer ", "") || req.cookies?.sessionId;
  const session = sessions.get(sessionId);
  
  if (session && session.expiresAt > new Date()) {
    (req as any).userId = session.userId;
    (req as any).email = session.email;
  }
  
  next();
}

// Create a new session
export function createSession(email: string, userId: string): string {
  const { randomBytes } = require("crypto");
  const sessionId = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  
  sessions.set(sessionId, { email, userId, expiresAt });
  
  return sessionId;
}

// Delete a session
export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

// Get session
export function getSession(sessionId: string): { email: string; userId: string; expiresAt: Date } | undefined {
  return sessions.get(sessionId);
}
