import jwt from 'jsonwebtoken';

const ACCESS_TTL = '15m';
export function signAccessToken(user) {
  if (!process.env.JWT_ACCESS_SECRET || Buffer.byteLength(process.env.JWT_ACCESS_SECRET) < 32) {
    throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters');
  }
  return jwt.sign({ email: user.email }, process.env.JWT_ACCESS_SECRET, {
    subject: String(user.id), expiresIn: ACCESS_TTL, issuer: 'campusos-api', audience: 'campusos-web'
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
    issuer: 'campusos-api', audience: 'campusos-web'
  });
}


