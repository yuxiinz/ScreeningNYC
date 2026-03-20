import { PrismaClient } from '@prisma/client';
import { PrismaPostgres } from '@prisma/adapter-pg'; 
import pg from 'pg';
import fs from 'fs';
import path from 'path';

// 强制手动读取 .env (防止 Docker 环境下变量丢失)
const envPath = path.join(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const dbUrl = envContent.match(/DATABASE_URL=["']?(.+?)["']?(\s|$)/)?.[1];

const pool = new pg.Pool({ connectionString: dbUrl });
const adapter = new PrismaPostgres(pool);

// 导出单例，防止连接数过多
export const prisma = new PrismaClient({ adapter });