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
  // First: Collect all liquid nodes from the AST
  const liquidNodes: LiquidNode[] = [];
  const liquidTagNodes: LiquidNode[] = [];
  
  visit(tree, (node: Node) => {
    // Process expression nodes immediately
    if (node.type === 'liquidExpression') {
      processExpression(node as LiquidNode);
      liquidNodes.push(node as LiquidNode);
    } 
    // Collect tag nodes for multi-stage processing
    else if (node.type === 'liquidTag') {
      const tagNode = node as LiquidNode;
      liquidNodes.push(tagNode);
      liquidTagNodes.push(tagNode);
    }
  });

  // Second: Initial processing of individual tag nodes
  liquidTagNodes.forEach(processTag);
  
  // Third: Perform block association on tag nodes
  if (liquidTagNodes.length > 0) {
    associateBlockTags(liquidTagNodes);
    
    // Validate associations
    validateBlockAssociations(liquidTagNodes);
  }
}

/**
 * Validate block associations to catch any remaining issues
 */
function validateBlockAssociations(nodes: LiquidNode[]): void {
  // Maps to track block associations
  const blockStartMap = new Map<string, LiquidNode[]>();
  const blockEndMap = new Map<string, LiquidNode[]>();
  
  // First pass: collect all block starts and ends by type
  for (const node of nodes) {
    if (!node.liquidAST) continue;
    
    const { tagName, isBlockStart, isBlockEnd } = node.liquidAST;
    
    if (isBlockStart) {
      const type = tagName;
      if (!blockStartMap.has(type)) {
        blockStartMap.set(type, []);
      }
      blockStartMap.get(type)!.push(node);
    } else if (isBlockEnd) {
      const type = tagName.substring(3); // Remove 'end' prefix
      if (!blockEndMap.has(type)) {
        blockEndMap.set(type, []);
      }
      blockEndMap.get(type)!.push(node);
    }
  }
  
  // Second pass: check that all blocks of each type are properly closed
  for (const [blockType, startNodes] of blockStartMap.entries()) {
    const endNodes = blockEndMap.get(blockType) || [];
    
    // If we have different counts of start and end tags for a block type
    if (startNodes.length !== endNodes.length) {
      // Mark orphaned start/end tags with errors
      if (startNodes.length > endNodes.length) {
        // More start tags than end tags - some blocks are unclosed
        const unclosedCount = startNodes.length - endNodes.length;
        
        // Identify which start nodes don't have matching end nodes
        const unmatched = startNodes.filter(node => 
          !node.parseSuccess || !node.blockId || !node.relatedBlockNodes?.some(rel => rel.liquidAST?.isBlockEnd)
        );
        
        // Mark appropriate number of start nodes as unclosed
        unmatched.slice(0, unclosedCount).forEach(node => {
          node.parseError = `Unclosed block tag '${blockType}'`;
          node.parseSuccess = false;
        });
      }
      else if (endNodes.length > startNodes.length) {
        // More end tags than start tags - some end tags are orphaned
        const orphanedCount = endNodes.length - startNodes.length;
        
        // Identify which end nodes don't have matching start nodes
        const unmatched = endNodes.filter(node => 
          !node.parseSuccess || !node.matchingBlockId || !node.relatedBlockNodes?.some(rel => rel.liquidAST?.isBlockStart)
        );
        
        // Mark appropriate number of end nodes as orphaned
        unmatched.slice(0, orphanedCount).forEach(node => {
          node.parseError = `End tag 'end${blockType}' without a matching start tag`;
          node.parseSuccess = false;
        });
      }
    }
  }
}
