declare module 'pino-http' {
  import type { Logger } from 'pino';

  interface PinoHttpOptions {
    logger?: Logger;
    genReqId?: () => string;
    serializers?: {
      req?: (req: { id?: string; method?: string; url?: string; socket?: { remoteAddress?: string } }) => unknown;
    };
  }

  function pinoHttp(options?: PinoHttpOptions): (req: unknown, res: unknown, next: () => void) => void;

  export default pinoHttp;
}

declare module 'supertest';
