/**
 * Ambient declarations the payload owns.
 *
 * The stylesheet is imported for its side effect (`import "./styles.css"`).
 * Standalone, Vite handles it; in the factory the CSS is compiled separately
 * and the import is stripped from the client bundle. Either way TypeScript
 * needs to know the module exists — declaring it here rather than relying on
 * `vite/client` is what keeps the local typecheck honest, since the factory's
 * check worker has no Vite types. Without this, every app inherits a
 * diagnostic that the publish gate then has to ignore globally.
 */
declare module "*.css" {
  const content: string;
  export default content;
}
