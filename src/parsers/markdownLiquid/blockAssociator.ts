/**
 * Block associator module responsible for associating related Liquid block tags.
 */
import { LiquidNode } from './types.js';

/**
 * Associate related block tags (start tags, continuation tags, and end tags)
 * This helps build a structure of blocks and their relationships
 */
export function associateBlockTags(liquidNodes: LiquidNode[]): void {
  const blockStacks: Record<string, LiquidNode[]> = {};
  
  for (let i = 0; i < liquidNodes.length; i++) {
    const node = liquidNodes[i];
    const ast = node.liquidAST;
    if (!ast || !ast.tagName) continue;
    
    const tagName = ast.tagName;
    
    if (ast.isBlockStart) {
      // Process start of a block (if, for, unless, etc.)
      processBlockStart(node, tagName, blockStacks);
    } else if (tagName.startsWith('end')) {
      // Process end of a block (endif, endfor, etc.)
      processBlockEnd(node, tagName, blockStacks);
    } else if (ast.isContinuation) {
      // Process continuation tags (else, elsif, when, etc.)
      processContinuationTag(node, tagName, blockStacks);
    }
  }
  
  // Check for unclosed blocks
  markUnclosedBlocks(blockStacks);
}

/**
 * Process the start of a block tag
 */
function processBlockStart(
  node: LiquidNode, 
  tagName: string, 
  blockStacks: Record<string, LiquidNode[]>
): void {
  if (!blockStacks[tagName]) {
    blockStacks[tagName] = [];
  }
  blockStacks[tagName].push(node);
  
  // Set a reference ID for this block
  node.blockId = `${tagName}-block-${blockStacks[tagName].length}`;
}

/**
 * Process the end of a block tag
 */
function processBlockEnd(
  node: LiquidNode, 
  tagName: string, 
  blockStacks: Record<string, LiquidNode[]>
): void {
  // Remove 'end' prefix to get the block type
  const blockType = tagName.substring(3);
  
  if (blockStacks[blockType] && blockStacks[blockType].length > 0) {
    const matchingStartNode = blockStacks[blockType].pop();
    if (matchingStartNode) {
      linkEndTagToStart(node, matchingStartNode);
    }
  }
}

/**
 * Process a continuation tag (else, elsif, etc.)
 */
function processContinuationTag(
  node: LiquidNode,
  tagName: string,
  blockStacks: Record<string, LiquidNode[]>
): void {
  // Try to find the most recent open block this could belong to
  let matchFound = false;
  
  for (const blockType of Object.keys(blockStacks)) {
    if (blockStacks[blockType] && blockStacks[blockType].length > 0) {
      const potentialMatchingNode = blockStacks[blockType][blockStacks[blockType].length - 1];
      
      // Check for specific tag-block relationships
      if (matchContinuationWithBlock(tagName, blockType, node, potentialMatchingNode)) {
        matchFound = true;
        break;
      }
    }
  }
  
  if (!matchFound) {
    // If no match found, this is likely an orphaned continuation tag
    node.parseError = `Continuation tag '${tagName}' without a matching block start`;
  }
}

/**
 * Match continuation tags with their appropriate block types
 */
function matchContinuationWithBlock(
  tagName: string,
  blockType: string,
  continuationNode: LiquidNode,
  startNode: LiquidNode
): boolean {
  // For 'else' and 'elsif', associate with 'if' blocks
  if ((tagName === 'else' || tagName === 'elsif') && blockType === 'if') {
    linkContinuationToStart(continuationNode, startNode);
    return true;
  }
  
  // For 'when', associate with 'case' blocks
  if (tagName === 'when' && blockType === 'case') {
    linkContinuationToStart(continuationNode, startNode);
    return true;
  }
  
  return false;
}

/**
 * Link an end tag to its matching start tag
 */
function linkEndTagToStart(endNode: LiquidNode, startNode: LiquidNode): void {
  // Set block associations
  endNode.matchingBlockId = startNode.blockId;
  endNode.blockId = startNode.blockId;
  
  // Set up bidirectional references
  if (!startNode.relatedBlockNodes) {
    startNode.relatedBlockNodes = [];
  }
  
  startNode.relatedBlockNodes.push(endNode);
  endNode.relatedBlockNodes = [startNode];
}

/**
 * Link a continuation tag to its parent block's start tag
 */
function linkContinuationToStart(continuationNode: LiquidNode, startNode: LiquidNode): void {
  // Use the same linking logic as for end tags
  continuationNode.matchingBlockId = startNode.blockId;
  continuationNode.blockId = startNode.blockId;
  
  if (!startNode.relatedBlockNodes) {
    startNode.relatedBlockNodes = [];
  }
  
  startNode.relatedBlockNodes.push(continuationNode);
  continuationNode.relatedBlockNodes = [startNode];
}

/**
 * Mark any unclosed blocks with error messages
 */
function markUnclosedBlocks(blockStacks: Record<string, LiquidNode[]>): void {
  Object.entries(blockStacks).forEach(([blockType, stack]) => {
    if (stack.length > 0) {
      stack.forEach(node => {
        node.parseError = `Unclosed block tag '${blockType}'`;
      });
    }
  });
}