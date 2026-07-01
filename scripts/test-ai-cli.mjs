import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'core/yacht-ai-cli.js'), 'utf8'), ctx);

const CLI = ctx.window.YachtAiCli;
const d = CLI.parseDemand('Motor yacht Rhodes 15-22 July 2026, 8 guests, budget 45k, Greek crew. I am Alex Marin, alex@demo.eu, +30 694 000 0000');
if (!d.start_date || !d.guests || d.budget !== 45000) throw new Error('parseDemand failed: ' + JSON.stringify(d));
if (!d.client_email || !d.client_name) throw new Error('contact parse failed');
console.log('AI CLI parseDemand ok:', d.start_date, '→', d.end_date, d.guests, 'pax', d.budget);
console.log('All AI CLI tests passed.');