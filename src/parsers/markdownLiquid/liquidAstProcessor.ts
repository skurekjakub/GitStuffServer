/**
 * Main AST processor that orchestrates the processing of Liquid nodes in the Markdown AST.
 */
import { visit } from 'unist-util-visit';
import { Node } from 'unist';
import { LiquidNode } from './types.js';
import { processExpression } from './expressionProcessor.js';
import { processTag } from './tagProcessor.js';
import { associateBlockTags } from './blockAssociator.js';

/**
 * Process Liquid nodes in the Markdown AST
 * This function orchestrates the whole processing pipeline:
 * 1. Collect liquid nodes from the AST
 * 2. Process expressions and tags separately
 * 3. Associate related block tags to build block structures
 */
export function processLiquidNodes(tree: Node): void {
  // First pass: Collect information about all liquid nodes in the AST
  const liquidTagNodes: LiquidNode[] = [];
  
  visit(tree, (node: Node) => {
    // Process expression nodes
    if (node.type === 'liquidExpression') {
      processExpression(node as LiquidNode);
    } 
    // Collect tag nodes for later processing
    else if (node.type === 'liquidTag') {
      liquidTagNodes.push(node as LiquidNode);
    }
  });

  // Second pass: Process all collected tag nodes
  liquidTagNodes.forEach(processTag);
  
  // Third pass: Associate related block tags (start, continuation, end)
  associateBlockTags(liquidTagNodes);
}
