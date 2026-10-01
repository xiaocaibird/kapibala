import { fileURLToPath } from 'node:url';
import { readChangeReviews } from './change-review.js';
const reviews = await readChangeReviews(fileURLToPath(new URL('../', import.meta.url)));
console.log(
  `变更影响评审登记有效：${reviews.length}条；仅核对登记与文档存在，不宣称风险覆盖充分。`,
);
