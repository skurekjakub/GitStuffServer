/**
 * Block associator module responsible for associating related Liquid block tags.
 */
import { LiquidNode } from './types.js';
import { extractTagName } from './tagClassifier.js';

/**
 * Debug helper to log details about a node
 */
function debugNode(node: LiquidNode): any {
  return {
    type: node.type,
    content: node.liquidContent,
    tagName: node.liquidAST?.tagName,
    position: node.position,
    blockId: node.blockId
  };
}

/**
 * Associate related block tags (start tags, continuation tags, and end tags)
 * This helps build a structure of blocks and their relationships
 */
export function associateBlockTags(liquidNodes: LiquidNode[]): void {
  // Filter out invalid nodes
  const validNodes = liquidNodes.filter(node => 
    node && node.liquidContent && node.type === 'liquidTag'
  );
  
  if (validNodes.length === 0) return;
  
  // Reset any previous association data
  validNodes.forEach(node => {
    node.parseError = undefined;
    node.parseSuccess = undefined;
    node.blockId = undefined;
    node.matchingBlockId = undefined;
    node.relatedBlockNodes = undefined;
  });

  // Ensure all nodes have position information for sorting
  ensurePositionInfo(validNodes);
  
  // Sort nodes by their appearance in the document
  const sortedNodes = sortNodesByPosition([...validNodes]);
  
  // Ensure all nodes have correct tag classification
  ensureTagClassification(sortedNodes);

  // Use a more intuitive block tracking approach
  // Keep track of open blocks with a stack, where each entry is:
  // [blockType, node, blockId]
  const blockStack: Array<[string, LiquidNode, string]> = [];
  
  // Map to track all nodes in each block
  const blockNodes = new Map<string, LiquidNode[]>();

  // Process nodes in document order
  for (let i = 0; i < sortedNodes.length; i++) {
    const node = sortedNodes[i];
    if (!node.liquidAST?.tagName) continue;
    
    const { tagName, isBlockStart, isBlockEnd, isContinuation } = node.liquidAST;
    
    if (isBlockStart) {
      // Starting a new block
      const blockId = `${tagName}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      node.blockId = blockId;
      node.parseSuccess = true; // Provisionally mark as successful
      
      // Push to block stack
      blockStack.push([tagName, node, blockId]);
      
      // Initialize block nodes collection
      blockNodes.set(blockId, [node]);
    }
    else if (isBlockEnd) {
      // Ending a block
      const blockType = tagName.substring(3); // Remove 'end' prefix
      
      // Look for the most recent matching open block
      let matchingBlockIdx = -1;
      
      for (let j = blockStack.length - 1; j >= 0; j--) {
        if (blockStack[j][0] === blockType) {
          matchingBlockIdx = j;
          break;
        }
      }
      
      if (matchingBlockIdx >= 0) {
        // Found a matching open block
        const [, startNode, blockId] = blockStack[matchingBlockIdx];
        
        // Associate this end tag with its block
        node.blockId = blockId;
        node.matchingBlockId = blockId;
        node.parseSuccess = true;
        
        // Add to block's node collection
        if (blockNodes.has(blockId)) {
          blockNodes.get(blockId)!.push(node);
        }
        
        // Close this block (remove from stack)
        blockStack.splice(matchingBlockIdx, 1);
      } else {
        // No matching open block found - this is an orphaned end tag
        node.parseError = `End tag '${tagName}' without a matching start tag`;
        node.parseSuccess = false;
      }
    }
    else if (isContinuation) {
      // Continuation tag (else, elsif, etc.)
      const compatibleBlockType = findCompatibleBlockType(tagName);
      
      if (compatibleBlockType) {
        // Look for the nearest compatible open block
        let foundCompatibleBlock = false;
        
        // Start from the innermost block and work outward
        for (let j = blockStack.length - 1; j >= 0; j--) {
          const [stackBlockType, startNode, blockId] = blockStack[j];
          
          if (stackBlockType === compatibleBlockType) {
            // Associate with this block
            node.blockId = blockId;
            node.matchingBlockId = blockId;
            node.parseSuccess = true;
            
            // Add to block's node collection
            if (blockNodes.has(blockId)) {
              blockNodes.get(blockId)!.push(node);
            }
            
            foundCompatibleBlock = true;
            break;
          }
        }
        
        if (!foundCompatibleBlock) {
          // No compatible block found
          node.parseError = `Continuation tag '${tagName}' without a matching block start`;
          node.parseSuccess = false;
        }
      } else {
        // Unknown continuation tag type
        node.parseError = `Unknown continuation tag type: '${tagName}'`;
        node.parseSuccess = false;
      }
    }
  }
  
  // Check for any unclosed blocks
  blockStack.forEach(([blockType, startNode]) => {
    startNode.parseError = `Unclosed block tag '${blockType}'`;
    startNode.parseSuccess = false;
  });
  
  // Set up bidirectional references
  setupBlockRelationships(blockNodes);
}

/**
 * Set up bidirectional relationships between nodes in each block
 */
function setupBlockRelationships(blockNodes: Map<string, LiquidNode[]>): void {
  for (const [blockId, nodes] of blockNodes.entries()) {
    if (nodes.length <= 1) continue; // Skip single-node blocks
    
    // Find the start node (should be the first one)
    const startNode = nodes.find(n => n.liquidAST?.isBlockStart);
    if (!startNode) continue;
    
    // Find the end node (should be the last one)
    const endNode = nodes.find(n => n.liquidAST?.isBlockEnd);
    
    // Find any continuation nodes
    const continuationNodes = nodes.filter(n => 
      n !== startNode && n !== endNode && n.liquidAST?.isContinuation
    );
    
    // Set up relationships
    startNode.relatedBlockNodes = [];
    
    // Add continuations and end node to start node's related nodes
    if (continuationNodes.length > 0) {
      startNode.relatedBlockNodes.push(...continuationNodes);
      
      // Set back-references
      continuationNodes.forEach(node => {
        node.relatedBlockNodes = [startNode];
      });
    }
    
    if (endNode) {
      startNode.relatedBlockNodes.push(endNode);
      endNode.relatedBlockNodes = [startNode];
    }
  }
}

/**
 * Ensure all nodes have position information for sorting
 */
function ensurePositionInfo(nodes: LiquidNode[]): void {
  nodes.forEach((node, index) => {
    if (!node.position) {
      // Assign synthetic positions based on array index
      node.position = {
        start: { line: index, column: 0, offset: index * 1000 },
        end: { line: index, column: 10, offset: index * 1000 + 10 }
      };
    }
  });
}

/**
 * Sort nodes by their position in the document
 */
function sortNodesByPosition(nodes: LiquidNode[]): LiquidNode[] {
  return [...nodes].sort((a, b) => {
    // First sort by line
    const aLine = a.position?.start.line ?? 0;
    const bLine = b.position?.start.line ?? 0;
    
    if (aLine !== bLine) {
      return aLine - bLine;
    }
    
    // Then by column
    const aCol = a.position?.start.column ?? 0;
    const bCol = b.position?.start.column ?? 0;
    
    if (aCol !== bCol) {
      return aCol - bCol;
    }
    
    // Finally by offset
    const aOffset = a.position?.start.offset ?? 0;
    const bOffset = b.position?.start.offset ?? 0;
    
    return aOffset - bOffset;
  });
}

/**
 * Ensure all nodes have proper tag classification
 */
function ensureTagClassification(nodes: LiquidNode[]): void {
  nodes.forEach(node => {
    if (!node.liquidAST) {
      node.liquidAST = {};
    }
    
    if (!node.liquidInnerContent) {
      node.liquidInnerContent = node.liquidContent?.replace(/^\{%\s*|\s*%\}$/g, '');
    }
    
    if (!node.liquidAST.tagName && node.liquidInnerContent) {
      node.liquidAST.tagName = extractTagName(node.liquidInnerContent);
    }
    
    const tagName = node.liquidAST.tagName || '';
    
    // Set classification flags if not already set
    if (!('isBlockStart' in node.liquidAST)) {
      node.liquidAST.isBlockStart = isBlockStartTag(tagName);
    }
    
    if (!('isBlockEnd' in node.liquidAST)) {
      node.liquidAST.isBlockEnd = isBlockEndTag(tagName);
    }
    
    if (!('isContinuation' in node.liquidAST)) {
      node.liquidAST.isContinuation = isContinuationTag(tagName);
    }
  });
}

/**
 * Check if a tag is a block start tag
 */
function isBlockStartTag(tagName: string): boolean {
  const BLOCK_TAGS = [
    'if', 'unless', 'for', 'case', 'capture', 'tablerow', 
    'raw', 'block', 'paginate', 'schema', 'style', 'form'
  ];
  return BLOCK_TAGS.includes(tagName);
}

/**
 * Check if a tag is a block end tag
 */
function isBlockEndTag(tagName: string): boolean {
  return tagName.startsWith('end') && isBlockStartTag(tagName.substring(3));
}

/**
 * Check if a tag is a continuation tag
 */
function isContinuationTag(tagName: string): boolean {
  const CONTINUATION_TAGS = [
    'else', 'elsif', 'elseif', 'when', 'empty'
  ];
  return CONTINUATION_TAGS.includes(tagName);
}

/**
 * Find the compatible block type for a continuation tag
 */
function findCompatibleBlockType(tagName: string): string | null {
  // Map continuation tags to their compatible block types
  switch (tagName) {
    case 'else':
    case 'elsif':
    case 'elseif': // Support both elsif and elseif
      return 'if';
    case 'when':
      return 'case';
    case 'empty':
      return 'for';
    default:
      return null;
  }
}