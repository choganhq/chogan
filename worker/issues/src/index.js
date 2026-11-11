// Entry point for wrangler. The logic is in app.js so the tests can run it under
// Node with a fake GitHub.
import { makeWorker } from './app.js';

export default makeWorker();
