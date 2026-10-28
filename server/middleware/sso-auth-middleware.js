import jwt from 'jsonwebtoken';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED_ROLES = new Set(['admin', 'leader', 'crew']);
const COOKIE_NAME = 'wannav_sso';

export function readSsoConfiguration(env = process.env) {
  const secret = env.JWT_SECRET;
  if (typeof secret !== 'string' || secret.trim().length < 32 || /change-in-production|your-shared-secret/i.test(secret)) {
    throw new Error('JWT_SECRET must be a configured shared secret of at least 32 characters');
  }
  let appUrl;
  let dashboardUrl;
  try {
    appUrl = new URL(env.APP_ORIGIN);
    dashboardUrl = new URL(env.DASHBOARD_URL || 'https://wannav-main.onrender.com');
  } catch {
    throw new Error('APP_ORIGIN and DASHBOARD_URL must be absolute HTTP(S) URLs');
  }
  for (const url of [appUrl, dashboardUrl]) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || (env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
      throw new Error('SSO URLs must use HTTPS in production and must not contain credentials');
    }
  }
  if (appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
    throw new Error('APP_ORIGIN must contain only the scheme, hostname and optional port');
  }
  return {
    secret,
    appOrigin: appUrl.origin,
    dashboardUrl: dashboardUrl.href,
    secure: env.NODE_ENV === 'production'
  };
}

export function createSsoAuthMiddleware(configuration) {
  const { secret, appOrigin, dashboardUrl, secure } = configuration;
  const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' };

  return function ssoAuthMiddleware(req, res, next) {
    const normalizedPath = req.path.toLowerCase();
    const isApi = normalizedPath === '/api' || normalizedPath.startsWith('/api/');
    const isRead = req.method === 'GET' || req.method === 'HEAD';
    const isExternalKpiSnapshotRead = isRead
      && /^\/api\/kpi-snapshots\/\d{4}-\d{2}$/.test(normalizedPath)
      && /^Bearer\s+\S+$/i.test(req.get('Authorization') || '');
    // The route itself validates the dedicated read-only token. No other API route bypasses SSO.
    if (isExternalKpiSnapshotRead) return next();
    if (isRead && (req.path === '/api/health'
      || (!isApi && (req.path.startsWith('/assets/') || req.path === '/favicon.ico')))) {
      return next();
    }

    const reject = (status, message) => {
      res.set('Cache-Control', 'no-store');
      if (status === 401) res.clearCookie(COOKIE_NAME, cookieOptions);
      if (isApi) return res.status(status).json({ error: message, loginUrl: dashboardUrl });
      if (status === 403) return res.status(403).send('このシステムを利用する権限がありません。');
      return res.redirect(dashboardUrl);
    };

    // Query tokens are accepted only for the existing top-level SSO landing flow.
    const queryToken = !isApi && isRead ? req.query.auth_token : undefined;
    const token = queryToken || req.cookies?.[COOKIE_NAME];
    if (typeof token !== 'string' || !token) return reject(401, '認証が必要です。');

    let decoded;
    try {
      decoded = jwt.verify(token, secret, { algorithms: ['HS256'], maxAge: '1h' });
      if (!decoded || typeof decoded !== 'object' || decoded.type !== 'sso'
        || !Number.isFinite(decoded.exp) || !decoded.userId
        || typeof decoded.username !== 'string' || !decoded.username
        || new URL(decoded.targetUrl).origin !== appOrigin) {
        return reject(401, '認証情報が無効です。');
      }
    } catch {
      return reject(401, '認証の有効期限が切れたか、認証情報が無効です。');
    }

    if (!ALLOWED_ROLES.has(decoded.role)) return reject(403, 'このシステムを利用する権限がありません。');
    if (decoded.role === 'crew' && (decoded.iss !== new URL(dashboardUrl).origin || decoded.aud !== appOrigin)) {
      return reject(401, '認証情報が無効です。');
    }

    if (!SAFE_METHODS.has(req.method)
      && (req.get('Origin') !== appOrigin || req.get('X-WannaV-Request') !== '1')) {
      return reject(403, '操作元を確認できません。画面を開き直してください。');
    }

    req.user = { id: decoded.userId, username: decoded.username, role: decoded.role };
    if (decoded.role === 'crew') {
      req.user.tutorName = typeof decoded.tutorName === 'string' && decoded.tutorName.length <= 100
        && decoded.tutorName.trim() === decoded.tutorName && !/[\x00-\x1f\x7f]/.test(decoded.tutorName)
        ? decoded.tutorName : null;
    }
    res.set('Cache-Control', 'no-store');
    if (queryToken) {
      res.set('Referrer-Policy', 'no-referrer');
      res.cookie(COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: Math.max(0, Math.min(60 * 60 * 1000, decoded.exp * 1000 - Date.now()))
      });
      const destination = new URL(req.originalUrl, appOrigin);
      destination.searchParams.delete('auth_token');
      return res.redirect(destination.pathname + destination.search);
    }
    return next();
  };
}
