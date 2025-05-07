/**
 * Expression processor module responsible for processing Liquid expressions.
 */
import { Liquid } from 'liquidjs';
import { LiquidNode } from './types.js';

// Create Liquid instance with lenient error handling for expressions
const liquidEngine = new Liquid({
  strictVariables: false,
  strictFilters: false
});

/**
 * Process a Liquid expression node ({{ ... }})
 * Extracts inner content and attempts to parse with LiquidJS
 */
export function processExpression(node: LiquidNode): void {
  if (!node.liquidContent) return;
  
  // Store original content
  node.originalContent = node.liquidContent;
  
  // Extract inner content (without {{ }})
  node.liquidInnerContent = node.liquidContent
    .replace(/^\{\{\s*/, '')
    .replace(/\s*\}\}$/, '');
  
  // Try to parse expression
  try {
    node.liquidAST = liquidEngine.parse(node.liquidContent);
    node.parseSuccess = true;
  } catch (e: any) {
    node.parseSuccess = false;
    node.parseError = e.message;
    node.liquidAST = {
      type: 'expression',
      content: node.liquidInnerContent,
      error: e.message
    };
  }
}