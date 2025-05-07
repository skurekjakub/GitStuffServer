import { visit, SKIP } from 'unist-util-visit';
import { Node } from 'unist';
import { LiquidExpressionNode, LiquidTagNode } from './types.js';

// Add proper type definition for text nodes
interface TextNode extends Node {
  type: 'text';
  value: string;
}

// List of known Liquid block tags that require a corresponding end tag.
// This list can be extended based on the specific Liquid environment/custom tags.
const BLOCK_TAGS = [
  'if', 'unless', 'for', 'block', 'capture', 'case', 'form', 'paginate', 'tablerow', 'raw',
  // Liquid-Shopify specific or other common block tags can be added here
  // 'assign' is not a block tag in the same way (no endassign), 'liquid' is for multiline.
  // 'style' and 'schema' in Shopify are special section tags, often large.
];

// Custom Remark plugin to identify Liquid tags
export function remarkLiquid() {
  return (tree: Node) => {
    visit(tree, 'text', (node: any, index, parent: any) => {
      if (typeof index !== 'number' || !node.value || typeof node.value !== 'string') {
        return;
      }

      let currentText = node.value;
      const newNodes: (TextNode | LiquidExpressionNode | LiquidTagNode)[] = [];
      let cursor = 0;

      while (cursor < currentText.length) {
        const openExpressionPos = currentText.indexOf('{{', cursor);
        const openTagPos = currentText.indexOf('{%', cursor);

        let firstOpenPos = -1;
        let isTag = false; // false for expression {{ }}, true for tag {% %}

        // Determine if the next Liquid construct is an expression or a tag
        if (openExpressionPos !== -1 && (openTagPos === -1 || openExpressionPos < openTagPos)) {
          firstOpenPos = openExpressionPos;
          isTag = false;
        } else if (openTagPos !== -1) {
          firstOpenPos = openTagPos;
          isTag = true;
        } else {
          // No more Liquid constructs found in the remaining text
          if (cursor < currentText.length) {
            newNodes.push({ type: 'text', value: currentText.slice(cursor) } as TextNode);
          }
          break; // Exit the while loop
        }

        // Add any preceding text before the found Liquid construct
        if (firstOpenPos > cursor) {
          newNodes.push({ type: 'text', value: currentText.slice(cursor, firstOpenPos) } as TextNode);
        }

        if (!isTag) { // It's an expression: {{ ... }}
          const closeExpressionPos = currentText.indexOf('}}', firstOpenPos + 2);
          if (closeExpressionPos === -1) {
            // Unterminated expression, treat the rest as text and stop processing this node
            newNodes.push({ type: 'text', value: currentText.slice(firstOpenPos) } as TextNode);
            cursor = currentText.length; // Move cursor to end
            break;
          }
          const fullExpression = currentText.slice(firstOpenPos, closeExpressionPos + 2);
          newNodes.push({
            type: 'liquidExpression',
            liquidContent: fullExpression,
            children: [], // MDAST nodes expect children
          } as LiquidExpressionNode);
          cursor = closeExpressionPos + 2;
        } else { // It's a tag: {% ... %}
          const closeTagInitialPos = currentText.indexOf('%}', firstOpenPos + 2);
          if (closeTagInitialPos === -1) {
            // Unterminated tag, treat the rest as text and stop processing this node
            newNodes.push({ type: 'text', value: currentText.slice(firstOpenPos) } as TextNode);
            cursor = currentText.length; // Move cursor to end
            break;
          }

          const tagSignature = currentText.slice(firstOpenPos + 2, closeTagInitialPos).trim();
          const tagNameMatch = tagSignature.match(/^(\w+)/);
          const tagName = tagNameMatch ? tagNameMatch[1] : '';

          if (BLOCK_TAGS.includes(tagName)) {
            // It's a block tag, attempt to find its corresponding end tag
            let depth = 1;
            let searchPos = closeTagInitialPos + 2;
            let endTagFound = false;
            let blockEndPos = closeTagInitialPos; // Initialize with the end of the opening tag

            while (searchPos < currentText.length) {
              const nextOpenTagMarker = currentText.indexOf('{%', searchPos);
              if (nextOpenTagMarker === -1) { // No more tags, so the block is unclosed
                break;
              }
              const nextCloseTagMarker = currentText.indexOf('%}', nextOpenTagMarker + 2);
              if (nextCloseTagMarker === -1) { // Malformed subsequent tag
                break;
              }

              const nextTagSignature = currentText.slice(nextOpenTagMarker + 2, nextCloseTagMarker).trim();
              const nextTagNameMatch = nextTagSignature.match(/^(\w+)/);
              const nextTagName = nextTagNameMatch ? nextTagNameMatch[1] : '';

              if (nextTagName === tagName) { // A nested opening tag of the same kind
                depth++;
              } else if (nextTagName === `end${tagName}`) { // A closing tag of the same kind
                depth--;
                if (depth === 0) { // Found the matching end tag for the initial block
                  blockEndPos = nextCloseTagMarker;
                  endTagFound = true;
                  break;
                }
              }
              searchPos = nextCloseTagMarker + 2; // Continue searching after the current tag
            }

            if (endTagFound) {
              const fullBlockContent = currentText.slice(firstOpenPos, blockEndPos + 2);
              newNodes.push({
                type: 'liquidTag', // Could be a more specific 'liquidBlockTag' if needed
                liquidContent: fullBlockContent,
                children: [],
              } as LiquidTagNode);
              cursor = blockEndPos + 2;
            } else {
              // Block tag without a proper end, or parsing failed. Treat as a simple tag.
              const simpleTagContent = currentText.slice(firstOpenPos, closeTagInitialPos + 2);
              newNodes.push({
                type: 'liquidTag',
                liquidContent: simpleTagContent,
                children: [],
              } as LiquidTagNode);
              cursor = closeTagInitialPos + 2;
            }
          } else {
            // Not a block tag (or not in our list), treat as a simple tag
            const simpleTagContent = currentText.slice(firstOpenPos, closeTagInitialPos + 2);
            newNodes.push({
              type: 'liquidTag',
              liquidContent: simpleTagContent,
              children: [],
            } as LiquidTagNode);
            cursor = closeTagInitialPos + 2;
          }
        }
      }

      // Only replace the node if actual changes/segmentation occurred
      if (newNodes.length > 0 && !(newNodes.length === 1 && newNodes[0].type === 'text' && (newNodes[0] as any).value === node.value)) {
        parent.children.splice(index, 1, ...newNodes);
        return [SKIP, index + newNodes.length]; // Adjust index for next visit and skip original node
      }
      // If no changes, allow other visitors to process or default behavior.
    });
  };
}
