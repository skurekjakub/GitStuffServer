/**
 * Tag processor module responsible for processing Liquid tags.
 */
import { Liquid } from 'liquidjs';
import { LiquidNode } from './types.js';
import { extractTagName } from './tagClassifier.js';

// Create Liquid instance with lenient error handling for tags
const liquidEngine = new Liquid({
  strictVariables: false,
  strictFilters: false
});

// Block and continuation tag definitions
const BLOCK_TAGS = [
  'if', 'unless', 'for', 'case', 'capture', 'tablerow', 
  'raw', 'block', 'paginate', 'schema', 'style', 'form'
];

const CONTINUATION_TAGS = [
  'else', 'elsif', 'elseif', 'when', 'empty',
  'endcase', 'endform', 'endpaginate', 'endblock'
];

/**
 * Process a Liquid tag node ({% ... %})
 * Extracts inner content and analyzes tag type
 */
export function processTag(node: LiquidNode): void {
  if (!node.liquidContent) return;
  
  // Store original content
  node.originalContent = node.liquidContent;
  
  // Extract inner content (without {% %})
  node.liquidInnerContent = node.liquidContent
    .replace(/^\{%\s*/, '')
    .replace(/\s*%\}$/, '');
    
  // Extract tag name
  const innerContent = node.liquidInnerContent || '';
  const tagName = extractTagName(innerContent);
  
  // Create a comprehensive AST representation
  node.liquidAST = {
    type: 'tag',
    tagName: tagName,
    isBlockStart: isBlockStartTag(tagName),
    isBlockEnd: isBlockEndTag(tagName),
    isContinuation: isContinuationTag(tagName),
    content: innerContent,
  };
  
  // For simple tags (not block tags or related), try to parse with LiquidJS
  if (!isBlockStartTag(tagName) && !isBlockEndTag(tagName) && !isContinuationTag(tagName)) {
    tryParseSimpleTag(node, innerContent);
  } else {
    // Mark block-related tags as successfully processed
    // (block association will be handled by the block associator)
    node.parseSuccess = true;
  }
}

/**
 * Try to parse a simple tag (non-block tag) with LiquidJS
 */
function tryParseSimpleTag(node: LiquidNode, innerContent: string): void {
  try {
    const parsedAST = liquidEngine.parse(`{% ${innerContent} %}`);
    node.liquidAST.parsedAST = parsedAST;
    node.parseSuccess = true;
  } catch (e: any) {
    node.parseSuccess = false;
    node.parseError = e.message;
  }
}

/**
 * Check if a tag is a block start tag
 */
function isBlockStartTag(tagName: string): boolean {
  return BLOCK_TAGS.includes(tagName);
}

/**
 * Check if a tag is a block end tag
 */
function isBlockEndTag(tagName: string): boolean {
  return tagName.startsWith('end') && BLOCK_TAGS.includes(tagName.substring(3));
}

/**
 * Check if a tag is a continuation tag
 */
function isContinuationTag(tagName: string): boolean {
  return CONTINUATION_TAGS.includes(tagName);
}