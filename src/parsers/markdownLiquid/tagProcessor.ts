/**
 * Tag processor module responsible for processing Liquid tags.
 */
import { Liquid } from 'liquidjs';
import { LiquidNode } from './types.js';
import { 
  extractTagName, 
  isBlockStartTag, 
  isContinuationOrEndTag 
} from './tagClassifier.js';

// Create Liquid instance with lenient error handling for tags
const liquidEngine = new Liquid({
  strictVariables: false,
  strictFilters: false
});

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
  
  // Create a simplified AST representation
  node.liquidAST = {
    type: 'tag',
    tagName: tagName,
    isBlockStart: isBlockStartTag(tagName),
    isBlockEnd: tagName.startsWith('end'),
    isContinuation: isContinuationOrEndTag(tagName) && !tagName.startsWith('end'),
    content: innerContent,
  };
  
  // For simple tags (not block tags), try to parse with LiquidJS
  if (!isBlockStartTag(tagName) && !isContinuationOrEndTag(tagName)) {
    tryParseSimpleTag(node, innerContent);
  } else {
    // Mark block tags with appropriate messages
    addBlockTagMessage(node, tagName);
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
 * Add appropriate message for block and continuation tags
 */
function addBlockTagMessage(node: LiquidNode, tagName: string): void {
  node.parseSuccess = false;
  
  if (isBlockStartTag(tagName)) {
    node.parseError = `Block tag '${tagName}' requires a matching 'end${tagName}' tag`;
  } else if (isContinuationOrEndTag(tagName)) {
    node.parseError = `Tag '${tagName}' is part of a block structure`;
  }
}