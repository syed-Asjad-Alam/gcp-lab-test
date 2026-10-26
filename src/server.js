import { createApp } from './app.js';

const apiKey = process.env.API_KEY;
if (!apiKey) {
  console.error('API_KEY environment variable is required.');
  process.exit(1);
}

const port = Number(process.env.PORT) || 3000;
createApp({ apiKey }).listen(port, () => {
  console.log(`Listening on port ${port}`);
});
