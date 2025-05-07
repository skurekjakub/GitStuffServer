import { Liquid } from 'liquidjs';
import { visit } from 'unist-util-visit';
import { Node } from 'unist';
import { LiquidNode } from './types.js';

const liquidEngine = new Liquid({
  // Add stricter error handling
  strictVariables: false,
  strictFilters: false
});

/**
 * Process Liquid content for parsing with LiquidJS
 * 
 * @param content The raw liquid content to process
 * @return A properly formatted string for LiquidJS parsing
 */
function prepareLiquidContent(content: string): string {
  if (!content) return '';
  
  // For expressions {{ ... }}, we can parse them directly
  if (content.startsWith('{{') && content.endsWith('}}')) {
    return content;
  }
  
  // For tags {% ... %}, we need to ensure they're valid for parsing
  // The issue is that LiquidJS expects complete blocks with proper end tags
  
  // For block tags that might be incomplete, wrap them in a proper template
  if (content.startsWith('{%') && content.endsWith('%}')) {
    // Special case: if this already looks like a complete block tag (has an end tag)
    if (content.includes('{% end')) {
      return content;
    }
    
    // Extract the tag name to determine if it needs an end tag
    const match = content.match(/{%\s*(\w+)/);
    if (match) {
      const tagName = match[1];
      // Common block tags that need end tags
      const blockTags = ['if', 'unless', 'for', 'case', 'block', 'raw', 'capture'];
      
      if (blockTags.includes(tagName)) {
        // Don't try to parse incomplete block tags, just store the raw content
        // and add a special flag to indicate it's incomplete
        return content; // Keep original for reference
      }
    }
    
    // For non-block tags, they can be parsed as-is
    return content;
  }
  
  return content;
}

export function processLiquidNodes(tree: Node): void {
  visit(tree, (node: Node) => {
    // Check if the node is one of our custom liquid nodes
    if (node.type === 'liquidExpression' || node.type === 'liquidTag') {
      const liquidNode = node as LiquidNode;
      if (liquidNode.liquidContent) {
        try {
          // Store the original content
          liquidNode.originalContent = liquidNode.liquidContent;
          
          // For expressions, extract just the inner part (without {{ }})
          if (node.type === 'liquidExpression') {
            liquidNode.liquidInnerContent = liquidNode.liquidContent
              .replace(/^\{\{\s*/, '')
              .replace(/\s*\}\}$/, '');
          }
          // For tags, extract just the inner part (without {% %})
          else if (node.type === 'liquidTag') {
            liquidNode.liquidInnerContent = liquidNode.liquidContent
              .replace(/^\{%\s*/, '')
              .replace(/\s*%\}$/, '');
          }
          
          try {
            // Try to parse individual expressions or simple tags
            const preparedContent = prepareLiquidContent(liquidNode.liquidContent);
            liquidNode.liquidAST = liquidEngine.parse(preparedContent);
            liquidNode.parseSuccess = true;
          } catch (parseError: any) {
            // If parsing fails, store the raw content and error
            liquidNode.parseSuccess = false;
            liquidNode.parseError = parseError.message;
            
            // Create a simpler representation instead of parsing
            if (node.type === 'liquidExpression') {
              liquidNode.liquidAST = {
                type: 'expression',
                content: liquidNode.liquidInnerContent,
                error: parseError.message
              };
            } else { // liquidTag
              // Extract the tag name
              const innerContent = liquidNode.liquidInnerContent || '';
              const match = innerContent.match(/^(\w+)/);
              const tagName = match ? match[1] : 'unknown';
              
              liquidNode.liquidAST = {
                type: 'tag',
                tagName: tagName,
                content: liquidNode.liquidInnerContent,
                error: parseError.message
              };
            }
          }
        } catch (e: any) {
          console.warn(`Failed to process Liquid content: ${liquidNode.liquidContent.replace(/`/g, "\\`")}`, e);
          liquidNode.liquidAST = { 
            error: 'Failed to process Liquid', 
            details: e.message 
          };
        }
      }
    }
  });
}
