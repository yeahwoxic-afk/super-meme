/** HTTP API. Dependencies are injected so every route is unit-testable. */
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { calcDailyTargets } from '../../shared/goals';
import type { FoodRecognizer, ImageMediaType } from './ai';
import { RecognitionRefusedError } from './ai';
import type { BarcodeLookup } from './barcode';
import { isValidBarcode } from './barcode';

export interface AppDeps {
  recognizer: FoodRecognizer;
  barcode: BarcodeLookup;
  /** If set, every /api request must send `Authorization: Bearer <token>`. */
  apiToken?: string;
  logger?: Pick<Console, 'error'>;
}

const PhotoBody = z.object({
  imageBase64: z.string().min(100).max(8_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']).default('image/jpeg'),
  hint: z.string().max(500).optional(),
});

const TextBody = z.object({ text: z.string().trim().min(2).max(2000) });

const ProfileBody = z.object({
  sex: z.enum(['male', 'female']),
  age: z.number().int().min(14).max(100),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(300),
  targetWeightKg: z.number().min(30).max(300).optional(),
  activity: z.enum(['sedentary', 'light', 'moderate', 'active', 'very_active']),
  goal: z.enum(['lose', 'maintain', 'gain', 'healthy']),
  onGlp1: z.boolean().default(false),
});

export function createApp(deps: AppDeps) {
  const log = deps.logger ?? console;
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', (req, res, next) => {
    if (!deps.apiToken) return next();
    if (req.headers.authorization === `Bearer ${deps.apiToken}`) return next();
    res.status(401).json({ error: 'unauthorized' });
  });

  app.post('/api/recognize/photo', async (req, res, next) => {
    const body = PhotoBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: 'invalid_request', details: body.error.issues });
    try {
      const { imageBase64, mediaType, hint } = body.data;
      res.json(await deps.recognizer.fromPhoto(stripDataUrl(imageBase64), mediaType as ImageMediaType, hint));
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/recognize/text', async (req, res, next) => {
    const body = TextBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: 'invalid_request', details: body.error.issues });
    try {
      res.json(await deps.recognizer.fromText(body.data.text));
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/barcode/:code', async (req, res, next) => {
    const code = req.params.code;
    if (!isValidBarcode(code)) return void res.status(400).json({ error: 'invalid_barcode' });
    try {
      const product = await deps.barcode.lookup(code);
      if (!product) return void res.status(404).json({ error: 'not_found' });
      res.json(product);
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/targets', (req, res) => {
    const body = ProfileBody.safeParse(req.body);
    if (!body.success) return void res.status(400).json({ error: 'invalid_request', details: body.error.issues });
    res.json(calcDailyTargets(body.data));
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof RecognitionRefusedError) {
      return void res.status(422).json({ error: 'refused', message: err.message });
    }
    log.error(err);
    res.status(502).json({ error: 'upstream_error', message: 'Сервис распознавания временно недоступен' });
  });

  return app;
}

function stripDataUrl(s: string): string {
  const i = s.indexOf('base64,');
  return i >= 0 ? s.slice(i + 7) : s;
}
