/**
 * Bans literal user-facing text in JSX.
 *
 * `eslint-plugin-i18next` is configured alongside this rule, but it only reports
 * JSX returned from a *function declaration* — `export const Page = () => <p>hi</p>`
 * passes it silently. Arrow components are half of any React codebase, so relying
 * on the plugin alone would leave the rule looking enforced while it wasn't.
 *
 * Two things are reported:
 *   - JSX text nodes containing a letter in any script;
 *   - string literals in attributes a user actually reads (alt, title,
 *     placeholder, aria-label...), which are as translatable as body text and
 *     are the ones people forget.
 *
 * <Trans> children are exempt: that component's whole job is holding markup
 * around an already-translated string.
 */

const TRANSLATABLE_ATTRIBUTES = new Set([
  'alt',
  'title',
  'placeholder',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'label',
  'summary',
]);

const EXEMPT_ELEMENTS = new Set(['Trans']);

/** Any letter in any script — Hebrew today, anything tomorrow. */
const HAS_LETTER = /\p{L}/u;

function elementName(node) {
  const name = node?.openingElement?.name;
  if (!name) return '';
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return name.property?.name ?? '';
  return '';
}

function insideExemptElement(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === 'JSXElement' && EXEMPT_ELEMENTS.has(elementName(current))) return true;
  }
  return false;
}

export const noLiteralJsxText = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Route every user-visible string through i18next rather than writing it inline.',
    },
    schema: [],
    messages: {
      text: 'Literal user-facing text: {{text}}. Every string goes through i18next with named parameters, so word order can differ per language.',
      attribute:
        "Literal text in the '{{name}}' attribute. Users read it, so it is translatable — use t('…').",
    },
  },

  create(context) {
    return {
      JSXText(node) {
        const value = node.value.trim();
        if (!value || !HAS_LETTER.test(value)) return;
        if (insideExemptElement(node)) return;
        context.report({
          node,
          messageId: 'text',
          data: { text: JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value) },
        });
      },

      JSXAttribute(node) {
        const name = node.name?.type === 'JSXIdentifier' ? node.name.name : undefined;
        if (!name || !TRANSLATABLE_ATTRIBUTES.has(name)) return;

        const value = node.value;
        if (!value) return;

        // alt="" is the correct, meaningful way to mark an image decorative.
        const literal =
          value.type === 'Literal'
            ? value
            : value.type === 'JSXExpressionContainer' && value.expression.type === 'Literal'
              ? value.expression
              : null;

        if (!literal || typeof literal.value !== 'string') return;
        if (!HAS_LETTER.test(literal.value)) return;

        context.report({ node: literal, messageId: 'attribute', data: { name } });
      },
    };
  },
};
