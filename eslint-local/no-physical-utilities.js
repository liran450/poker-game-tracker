/**
 * Bans physical-direction Tailwind utilities in favour of logical ones.
 *
 * Hebrew ships first but English is planned, and the pseudo-locale renders LTR
 * today — so a layout that reads `ml-2` is already wrong, not wrong later. There
 * is no Tailwind config option that removes these, and a code review will not
 * reliably catch one `pr-3` in a diff, so it is a lint rule.
 *
 * Checks className/class string literals and template literals, including the
 * strings inside clsx()-style calls, since that is where they hide.
 */

/** physical → logical. Order matters: longest prefix wins. */
const REPLACEMENTS = [
  ['border-l', 'border-s'],
  ['border-r', 'border-e'],
  ['rounded-tl', 'rounded-ss'],
  ['rounded-tr', 'rounded-se'],
  ['rounded-bl', 'rounded-es'],
  ['rounded-br', 'rounded-ee'],
  ['rounded-l', 'rounded-s'],
  ['rounded-r', 'rounded-e'],
  ['text-left', 'text-start'],
  ['text-right', 'text-end'],
  ['float-left', 'float-start'],
  ['float-right', 'float-end'],
  ['scroll-ml', 'scroll-ms'],
  ['scroll-mr', 'scroll-me'],
  ['scroll-pl', 'scroll-ps'],
  ['scroll-pr', 'scroll-pe'],
  ['ml', 'ms'],
  ['mr', 'me'],
  ['pl', 'ps'],
  ['pr', 'pe'],
  ['left', 'start'],
  ['right', 'end'],
  ['inset-l', 'inset-s'],
  ['inset-r', 'inset-e'],
];

/**
 * A utility is `[variants:]?[-]?base-value`. We match the base, allowing any
 * variant prefix (`sm:`, `hover:`, `group-focus:`) and a negative sign.
 */
function findViolations(value) {
  const found = [];
  for (const token of value.split(/\s+/)) {
    if (!token) continue;
    const base = token.replace(/^.*:/, '').replace(/^-/, '');
    for (const [physical, logical] of REPLACEMENTS) {
      // `ml-2`, `left-0`, `text-left`, `rounded-l`, and the bare `text-left`.
      if (base === physical || base.startsWith(`${physical}-`)) {
        found.push({ token, physical, logical });
        break;
      }
    }
  }
  return found;
}

const CLASS_ATTRIBUTES = new Set(['className', 'class']);

export const noPhysicalUtilities = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Use logical Tailwind utilities (ms-, me-, ps-, pe-, start-, end-) instead of physical ones.',
    },
    schema: [],
    messages: {
      physical:
        "'{{token}}' is a physical-direction utility. Use '{{logical}}-' instead — direction comes from the locale at runtime, and the pseudo-locale renders LTR.",
    },
  },

  create(context) {
    let insideClassAttribute = 0;

    function report(node, value) {
      for (const violation of findViolations(value)) {
        context.report({
          node,
          messageId: 'physical',
          data: { token: violation.token, logical: violation.logical },
        });
      }
    }

    function checkNode(node) {
      if (node.type === 'Literal' && typeof node.value === 'string') {
        report(node, node.value);
      } else if (node.type === 'TemplateLiteral') {
        for (const quasi of node.quasis) report(quasi, quasi.value.raw);
      }
    }

    return {
      /*
       * The counter, rather than inspecting the attribute value directly: the
       * Literal/TemplateLiteral visitors below then cover every shape a class
       * list can take — a bare string, a template, or anything nested inside a
       * clsx()/cn() call — with one code path and no double reporting.
       */
      JSXAttribute(node) {
        if (CLASS_ATTRIBUTES.has(node.name?.name)) insideClassAttribute += 1;
      },
      'JSXAttribute:exit'(node) {
        if (CLASS_ATTRIBUTES.has(node.name?.name)) insideClassAttribute -= 1;
      },
      /*
       * Any string anywhere inside the attribute, not just a direct argument.
       * `clsx('flex', cond && 'pr-3')` buries the class two nodes deep inside a
       * LogicalExpression, which a `CallExpression > Literal` selector misses —
       * and that conditional form is exactly where a stray physical utility
       * survives review.
       */
      Literal(node) {
        if (insideClassAttribute > 0 && typeof node.value === 'string') checkNode(node);
      },
      TemplateLiteral(node) {
        if (insideClassAttribute > 0) checkNode(node);
      },
    };
  },
};
