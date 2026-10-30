import express from 'express';
import { readKpiTargetRate, writeKpiTargetRate } from '../services/kpiSettingsService.js';

export function createKpiSettingsRouter({ queryable, env = process.env }) {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const targetRate = await readKpiTargetRate(queryable, env);
      res.json({ success: true, targetRate });
    } catch (error) {
      console.error('Error reading KPI settings:', error);
      res.status(500).json({ success: false, error: 'KPI設定を取得できませんでした。' });
    }
  });

  router.put('/', async (req, res) => {
    if (!['admin', 'leader'].includes(req.user?.role)) {
      return res.status(403).json({ success: false, error: 'KPI設定を変更する権限がありません。' });
    }
    try {
      const targetRate = await writeKpiTargetRate(queryable, req.body?.targetRate);
      return res.json({ success: true, targetRate });
    } catch (error) {
      if (error instanceof RangeError) {
        return res.status(400).json({ success: false, error: '目標延長率は0〜100で入力してください。' });
      }
      console.error('Error saving KPI settings:', error);
      return res.status(500).json({ success: false, error: 'KPI設定を保存できませんでした。' });
    }
  });

  return router;
}
