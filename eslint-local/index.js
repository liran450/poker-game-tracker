import { noPhysicalUtilities } from './no-physical-utilities.js';
import { noLiteralJsxText } from './no-literal-jsx-text.js';

/** Local ESLint plugin — rules specific to this repo's non-negotiables. */
export default {
  rules: {
    'no-physical-utilities': noPhysicalUtilities,
    'no-literal-jsx-text': noLiteralJsxText,
  },
};
