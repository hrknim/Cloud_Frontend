import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// 1. 환경 변수에서 DB URL 가져오기
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL이 .env 파일에 정의되지 않았습니다.');
}

// 2. pg 라이브러리를 이용한 커넥션 풀 생성
const pool = new Pool({ 
  connectionString,
  max: 10, 
  idleTimeoutMillis: 30000,
});

// 3. Prisma 7 전용 어댑터 생성
export const adapter = new PrismaPg(pool);

// 4. 전역 변수 설정 (Next.js 개발 모드 재연결 방지)
const globalForPrisma = global as unknown as { prisma: PrismaClient; prismaSchemaVersion?: string };
const prismaSchemaVersion = "public-links-v1";

// 5. adapter를 반드시 인자로 전달해야 합니다
export const prismaSetting = 
  // Replace a client retained by hot reload before the current schema was generated.
  (globalForPrisma.prismaSchemaVersion === prismaSchemaVersion ? globalForPrisma.prisma : undefined) ||
  new PrismaClient({ 
    adapter,
    // 필요 시 로그를 켜서 쿼리를 확인할 수 있습니다.
    // log: ['query', 'error', 'warn'], 
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prismaSetting;
  globalForPrisma.prismaSchemaVersion = prismaSchemaVersion;
}
