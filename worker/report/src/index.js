// Entry point for wrangler. The logic is in app.js so the tests can run it under
// Node with a fake GitHub; the page is bundled as text by wrangler's default rule
// for .html files.
import html from './form.html';
import { makeWorker } from './app.js';

export default makeWorker(html);
