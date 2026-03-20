import { fetchMetrograph } from '@/lib/ingest/adapters/metrograph';
import { prisma } from '@/lib/ingest/adapters/db';
import { DateTime } from 'luxon';

async function main() {
  console.log('🎬 正在获取 Metrograph 原始场次...');
  
  try {
    const rawData = await fetchMetrograph();
    
    if (rawData.length === 0) {
      console.warn('⚠️ 未抓取到任何场次，请检查选择器是否正确。');
      return;
    }

    console.log(`✅ 抓到 ${rawData.length} 条数据。预览：`);

    for (const item of rawData) {
      // 仅打印预览，暂不入库，方便调试
      console.log(`- 电影: ${item.movieTitle} | 原始时间: ${item.startTimeRaw}`);
    }

    // 这里可以继续写入库逻辑...
    
  } catch (error) {
    console.error('❌ 运行出错:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();