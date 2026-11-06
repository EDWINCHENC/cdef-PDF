import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/ui',timeout:120000,workers:1,reporter:[['list'],['json',{outputFile:'tests/results/ui.json'}]],expect:{timeout:20000},use:{trace:'retain-on-failure'},outputDir:'tests/results/playwright'});
