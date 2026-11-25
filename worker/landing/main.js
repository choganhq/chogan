// Entry point for wrangler: the landing page plus the report form (#1173). The form's logic
// lives in ../report/src so the tests can run it under Node with a fake GitHub.
import { withReport } from './index.js';
import report from '../report/src/index.js';

export default withReport(report);
