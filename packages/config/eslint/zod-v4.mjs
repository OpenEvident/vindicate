/**
 * @file Zod v4 lint guard — flags deprecated `z.string().uuid()` / `.url()` / `.email()` chains.
 *
 * `eslint-plugin-zod-v4` does not yet support ESLint 10; use this until it does.
 */
const DEPRECATED_STRING_FORMATS = ["uuid", "url", "email", "guid", "datetime", "date", "time"];

/** @type {import("eslint").Linter.Config[]} */
export const zodV4Recommended = [
  {
    files: ["**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...DEPRECATED_STRING_FORMATS.map((format) => ({
          selector: `CallExpression[callee.property.name='${format}'][callee.object.property.name='string']`,
          message: `z.string().${format}() is deprecated in Zod v4. Use z.${format}() or UuidSchema/UrlSchema from @vindicate/protocol.`
        }))
      ]
    }
  }
];
