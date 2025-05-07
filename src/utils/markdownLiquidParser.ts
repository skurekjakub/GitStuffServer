import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { Node } from 'unist';
import { remarkLiquid } from '../parsers/markdownLiquid/remarkLiquidPlugin.js';
import { processLiquidNodes } from '../parsers/markdownLiquid/liquidAstProcessor.js';

export async function parseMarkdownLiquid(markdownContent: string): Promise<Node> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkLiquid);

  const mdast = processor.parse(markdownContent);
  // The remarkLiquid plugin modifies the tree in place during the run phase
  const processedMdast = await processor.run(mdast);

  // After the initial Markdown AST is built and Liquid nodes are identified,
  // process them to parse the actual Liquid content.
  processLiquidNodes(processedMdast);

  return processedMdast;
}

// Example Usage (can be removed or kept for testing):
/*
async function testParser() {
  const content = `
# Hello World
This is a test with {{ variable }} and {% if user %}Hello {{ user.name }}{% endif %}.
Another expression: {{ another.var | upcase }}
Wrapped: {{ article.title | link_to: article.url }}
Tag: {% for item in items %}{{ item }}{% endfor %}
`;
  const ast = await parseMarkdownLiquid(content);
  console.log(JSON.stringify(ast, null, 2));
}

testParser().catch(console.error);
*/
