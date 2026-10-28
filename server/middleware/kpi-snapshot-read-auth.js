import crypto from 'crypto';
import jwt from 'jsonwebtoken';

function safeTokenEquals(actual, expected) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isAuthorizedKpiSnapshotRead({ authorization, ssoCookie }, env = process.env) {
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && safeTokenEquals(bearerMatch[1].trim(), env.KPI_SNAPSHOT_READ_TOKEN)) {
    return true;
  }

  if (!ssoCookie) return false;
  try {
    const decoded = jwt.verify(ssoCookie, env.JWT_SECRET || 'wannav-secret-key-change-in-production');
    return decoded.type === 'sso';
  } catch {
    return false;
  }
}

export default function kpiSnapshotReadAuth(req, res, next) {
  if (isAuthorizedKpiSnapshotRead({
    authorization: req.get('authorization'),
    ssoCookie: req.cookies?.wannav_sso,
  })) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'A valid read-only API token is required',
  });
}
