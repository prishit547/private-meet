import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '7842', 10),
  host: process.env.HOST || '0.0.0.0',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  useHttps: process.env.USE_HTTPS === 'true',
  sslKeyPath: process.env.SSL_KEY_PATH || '',
  sslCertPath: process.env.SSL_CERT_PATH || '',
  // ICE Servers configuration (STUN/TURN)
  // By default, open public STUN servers for direct NAT traversal.
  // Can be configured to point to a private coturn server via environment variables.
  iceServers: process.env.TURN_SERVER_URL
    ? [
        {
          urls: process.env.TURN_SERVER_URL,
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_PASSWORD
        },
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
};
