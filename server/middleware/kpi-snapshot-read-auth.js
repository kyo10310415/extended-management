import crypto from 'crypto';

function safeTokenEquals(actual, expected) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isAuthorizedKpiSnapshotRead({ authorization, authenticatedUser }, env = process.env) {
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch && safeTokenEquals(bearerMatch[1].trim(), env.KPI_SNAPSHOT_READ_TOKEN)) {
    return true;
  }

  return Boolean(authenticatedUser?.id && authenticatedUser?.role);
}

export default function kpiSnapshotReadAuth(req, res, next) {
  if (isAuthorizedKpiSnapshotRead({
    authorization: req.get('authorization'),
    authenticatedUser: req.user,
  })) {
    res.set('Cache-Control', 'no-store');
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'A valid read-only API token is required',
  });
}
