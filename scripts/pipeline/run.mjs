/**
 * Mika Creator — full asset pipeline orchestrator
 *   collect  -> copy originals to private/ and build manifest
 *   classify -> real AI classification (see classify.mjs) OR honest no-provider report
 *   process  -> generate public-safe derivatives (EXIF-strip, watermark, blur)
 */
import { fileURLToPath } from 'node:url';
import { main as collect } from './collect.mjs';
import { classifyAll } from './classify.mjs';
import { processAll } from './process.mjs';

export async function run(stage) {
  const stages = stage ? stage.split(',') : ['collect', 'classify', 'process'];
  for (const s of stages) {
    const t = Date.now();
    console.log(`\n=== stage: ${s} ===`);
    if (s === 'collect') collect();
    else if (s === 'classify') await classifyAll();
    else if (s === 'process') await processAll();
    else throw new Error(`unknown stage ${s}`);
    console.log(`=== ${s} done in ${((Date.now() - t) / 1000).toFixed(1)}s ===`);
  }
}

const requested = process.argv.slice(2).join(',');
run(requested || undefined).then(() => console.log('\nPipeline complete.')).catch((e) => { console.error('\nPipeline failed:', e.message); process.exitCode = 1; });