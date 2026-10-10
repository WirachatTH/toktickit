import express, { type NextFunction, type Request, type Response } from "express";
import { getPrisma } from "./prisma.js";
import { sessionUser } from "./authorization.js";
import { loginThrottle, type AttemptOutcome } from "./loginThrottle.js";
import { hashPassword, newPasswordError, passwordRuleError, verifyPassword, verifyPasswordForLogin } from "./password.js";
import {
  SESSION_COOKIE,
  SESSION_USER_SELECT,
  type SessionUser,
  createSession,
  deleteExpiredSessions,
  deleteOtherSessions,
  deleteSessionByToken,
  findSession,
  sessionCookieOptions,
} from "./session.js";

// Lab 3, Issue 3 — authentication (docs/lab-03/api-spec.md §1).
//
// Identity enters the server in exactly one place, the tt_session cookie
// (BR-03). This module establishes who is asking; whether they may ask —
// session required, password change pending, role — is decided once, for
// every route, by authorize() in authorization.ts (Issue 4).

export interface AuthContext {
  sessionId: number;
  user: SessionUser;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

function sendError(res: Response, status: number, code: string, message: string, fields?: Record<string, string>) {
  return res.status(status).json({ error: fields ? { code, message, fields } : { code, message } });
}

function sessionToken(req: Request): string | null {
  const value: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function clearSessionCookie(res: Response) {
  const { maxAge: _maxAge, ...attributes } = sessionCookieOptions();
  res.clearCookie(SESSION_COOKIE, attributes);
}

// Resolves the cookie, if any, into req.auth. A request with no cookie costs
// nothing. A database failure here goes to the safe-error handler (500).
export async function attachSession(req: Request, _res: Response, next: NextFunction) {
  const token = sessionToken(req);
  if (token === null) return next();
  try {
    const session = await findSession(getPrisma(), token);
    if (session) req.auth = session;
    next();
  } catch (error) {
    next(error);
  }
}

// One message for an unknown email, a wrong password, and an account without a
// password yet (BR-10, BR-12).
const INVALID_CREDENTIALS = "Email or password is incorrect.";

export const authRouter = express.Router();

// Auth responses carry identity; never let a cache keep them.
authRouter.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// §1.1 — POST /api/auth/login
authRouter.post("/login", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  // BR-09 — emails are compared trimmed and lowercased. Passwords are never trimmed.
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const fields: Record<string, string> = {};
  if (email === "") fields.email = "Enter your email address.";
  if (password === "") fields.password = "Enter your password.";
  if (Object.keys(fields).length > 0) {
    // A malformed request is not a guess at a password, so it is not counted.
    return sendError(res, 400, "VALIDATION_ERROR", "Some fields need attention.", fields);
  }

  // BR-14 — reserve this attempt BEFORE the first await (see loginThrottle.ts).
  // The reservation never touches the database, so a refused unknown email and
  // a refused real one are answered identically.
  const attempt = loginThrottle.beginAttempt(email, Date.now());
  if (!attempt.allowed) {
    const minutes = Math.ceil(attempt.retryAfterSeconds / 60);
    res.set("Retry-After", String(attempt.retryAfterSeconds));
    return sendError(
      res,
      429,
      "TOO_MANY_ATTEMPTS",
      `Too many sign-in attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
    );
  }

  // Every reserved attempt reports exactly one outcome: a failure counts, a
  // success clears the count, anything else (an inactive account's correct
  // password, a server error) just gives the slot back.
  let outcome: AttemptOutcome = "neutral";
  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { ...SESSION_USER_SELECT, passwordHash: true },
    });

    // BR-13 — the password is checked before anything else about the account,
    // so only someone who already knows it can learn the account is inactive.
    const passwordMatches = await verifyPasswordForLogin(password, user?.passwordHash ?? null);
    if (!user || !passwordMatches) {
      outcome = "failure";
      return sendError(res, 401, "INVALID_CREDENTIALS", INVALID_CREDENTIALS);
    }
    if (!user.isActive) {
      return sendError(res, 403, "ACCOUNT_INACTIVE", "This account is inactive. Contact your IT administrator.");
    }

    outcome = "success";
    // A browser holds one session: signing in replaces whatever it held.
    const previous = sessionToken(req);
    if (previous !== null) await deleteSessionByToken(prisma, previous);
    await deleteExpiredSessions(prisma, user.id); // BR-17
    const session = await createSession(prisma, user.id);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    res.cookie(SESSION_COOKIE, session.token, sessionCookieOptions());
    const { passwordHash: _hash, ...safeUser } = user;
    return res.status(200).json({ user: safeUser });
  } catch {
    outcome = "neutral";
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  } finally {
    loginThrottle.endAttempt(email, outcome, Date.now());
  }
});

// §1.3 — POST /api/auth/logout. Succeeds with or without a session (BR-18).
authRouter.post("/logout", async (req: Request, res: Response) => {
  const token = sessionToken(req);
  try {
    if (token !== null) await deleteSessionByToken(getPrisma(), token);
    clearSessionCookie(res);
    return res.status(204).end();
  } catch {
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
});

// §1.2 — GET /api/auth/me. Any signed-in user, a must-change one included
// (ROUTE_POLICIES); authorize() has already answered 401 without a session.
authRouter.get("/me", (req: Request, res: Response) => {
  return res.status(200).json({ user: sessionUser(req) });
});

// Lab 4, Issue 7 — GET /api/auth/session (docs/lab-04/api-spec.md §5, D-20).
// The same answer as /me, except that no session is `user: null` with 200, not
// 401: the app asks on every page load, and a browser logs every 401 as a
// console error. A must-change session reads itself here too (BR-02), because
// "optional" routes pass the password-change gate, as logout does.
authRouter.get("/session", (req: Request, res: Response) => {
  return res.status(200).json({ user: req.auth ? sessionUser(req) : null });
});

// §1.4 — POST /api/auth/change-password
authRouter.post("/change-password", async (req: Request, res: Response) => {
  const user = sessionUser(req);
  const sessionId = req.auth!.sessionId;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

  const fields: Record<string, string> = {};
  if (currentPassword === "") fields.currentPassword = "Enter your current password.";
  if (newPassword === "") fields.newPassword = "Enter a new password.";
  else {
    const rule = passwordRuleError(newPassword, user.email);
    if (rule) fields.newPassword = rule;
  }
  if (Object.keys(fields).length > 0) {
    return sendError(res, 400, "VALIDATION_ERROR", "Some fields need attention.", fields);
  }

  try {
    const prisma = getPrisma();
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    // A wrong current password is a field problem (400), not 401, so a typo
    // does not look like being signed out (api-spec §1.4).
    if (!(await verifyPassword(currentPassword, stored.passwordHash))) {
      return sendError(res, 400, "VALIDATION_ERROR", "Some fields need attention.", {
        currentPassword: "Your current password is incorrect.",
      });
    }
    const sameAsCurrent = newPasswordError(newPassword, user.email, currentPassword); // BR-08
    if (sameAsCurrent) {
      return sendError(res, 400, "VALIDATION_ERROR", "Some fields need attention.", { newPassword: sameAsCurrent });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
      select: SESSION_USER_SELECT,
    });
    await deleteOtherSessions(prisma, user.id, sessionId); // BR-19
    return res.status(200).json({ user: updated });
  } catch {
    return sendError(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
  }
});
