/** Server entry point. Reads configuration from environment variables. */
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeFoodRecognizer } from './ai';
import { createApp } from './app';
import { OpenFoodFactsLookup } from './barcode';

const port = Number(process.env.PORT ?? 8787);

const app = createApp({
  // Credentials resolve from ANTHROPIC_API_KEY (or an `ant auth login` profile).
  recognizer: new ClaudeFoodRecognizer(new Anthropic(), {
    model: process.env.AI_MODEL,
    effort: (process.env.AI_EFFORT as 'low' | 'medium' | 'high' | undefined) ?? undefined,
  }),
  barcode: new OpenFoodFactsLookup(),
  apiToken: process.env.APP_API_TOKEN || undefined,
});

app.listen(port, () => {
  console.log(`NutriAI API listening on http://0.0.0.0:${port}`);
});
