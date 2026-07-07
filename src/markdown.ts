import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

/**
 * Render trusted README markdown (our own repos) to HTML. Kept sync so callers
 * can drop the result straight into innerHTML during a render pass.
 */
export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}
