import { visit, SKIP } from 'unist-util-visit';
import { Node } from 'unist';
import { LiquidExpressionNode, LiquidTagNode, Position, LiquidNode } from './types.js';

// Add proper type definition for text nodes
interface TextNode extends Node {
  type: 'text';
  value: string;
}

// Helper to calculate position information based on string offsets
function calculatePosition(text: string, startOffset: number, endOffset: number): Position {
  // Pre-calculate line starts for efficiency
  const lines: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      lines.push(i + 1);
    }
  }

  // Find line and column for start position
  let startLine = 0;
  while (startLine + 1 < lines.length && lines[startLine + 1] <= startOffset) {
    startLine++;
  }
  const startColumn = startOffset - lines[startLine];

  // Find line and column for end position
  let endLine = startLine;
  while (endLine + 1 < lines.length && lines[endLine + 1] <= endOffset) {
    endLine++;
  }
  const endColumn = endOffset - lines[endLine];

  return {
    start: {
      line: startLine,
      column: startColumn,
      offset: startOffset
    },
    end: {
      line: endLine,
      column: endColumn,
      offset: endOffset
    }
  };
}

// Custom Remark plugin to identify Liquid tags
export function remarkLiquid() {
  return (tree: Node, file: { data: any }) => {
    // Create a global context for position tracking
    const positionContext = {
      documentOffset: 0,  // Track overall document offset
      nodeOffsets: new Map<Node, number>() // Store original offsets for each node
    };
    
    // Process the tree to calculate absolute positions
    calculateAbsolutePositions(tree, positionContext);

    visit(tree, 'text', (node: any, index, parent: any) => {
      if (typeof index !== 'number' || !node.value || typeof node.value !== 'string') {
        return;
      }

      let currentText = node.value;
      const newNodes: (TextNode | LiquidExpressionNode | LiquidTagNode)[] = [];
      let cursor = 0;
      
      // Get the absolute offset for this node
      const nodeAbsoluteOffset = positionContext.nodeOffsets.get(node) || 0;

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
            newNodes.push({ 
              type: 'text', 
              value: currentText.slice(cursor),
              position: calculatePosition(
                currentText, 
                cursor, 
                currentText.length
              )
            } as TextNode);
          }
          break; // Exit the while loop
        }

        // Add any preceding text before the found Liquid construct
        if (firstOpenPos > cursor) {
          newNodes.push({ 
            type: 'text', 
            value: currentText.slice(cursor, firstOpenPos),
            position: calculatePosition(
              currentText, 
              cursor, 
              firstOpenPos
            )
          } as TextNode);
        }

        if (!isTag) { // It's an expression: {{ ... }}
          const closeExpressionPos = currentText.indexOf('}}', firstOpenPos + 2);
          if (closeExpressionPos === -1) {
            // Unterminated expression, treat the rest as text and stop processing this node
            newNodes.push({ 
              type: 'text', 
              value: currentText.slice(firstOpenPos),
              position: calculatePosition(
                currentText, 
                firstOpenPos, 
                currentText.length
              )
            } as TextNode);
            cursor = currentText.length; // Move cursor to end
            break;
          }
          
          // Calculate position for this expression
          const expressionEndPos = closeExpressionPos + 2; // Include the closing '}}' 
          const localPosition = calculatePosition(
            currentText, 
            firstOpenPos, 
            expressionEndPos
          );
          
          // Adjust the position to reflect absolute document position
          const absolutePosition = {
            start: {
              ...localPosition.start,
              offset: localPosition.start.offset + nodeAbsoluteOffset
            },
            end: {
              ...localPosition.end,
              offset: localPosition.end.offset + nodeAbsoluteOffset
            }
          };
          
          // Full expression content including delimiters
          const fullExpression = currentText.slice(firstOpenPos, expressionEndPos);
          
          newNodes.push({
            type: 'liquidExpression',
            liquidContent: fullExpression,
            position: absolutePosition,
            // Store line numbers for easier debugging
            lineNumber: absolutePosition.start.line,
            columnNumber: absolutePosition.start.column,
            children: [], // MDAST nodes expect children
          } as LiquidExpressionNode);
          
          cursor = expressionEndPos;
        } else { // It's a tag: {% ... %}
          const closeTagInitialPos = currentText.indexOf('%}', firstOpenPos + 2);
          if (closeTagInitialPos === -1) {
            // Unterminated tag, treat the rest as text and stop processing this node
            newNodes.push({ 
              type: 'text', 
              value: currentText.slice(firstOpenPos),
              position: calculatePosition(
                currentText, 
                firstOpenPos, 
                currentText.length
              )
            } as TextNode);
            cursor = currentText.length; // Move cursor to end
            break;
          }

          const tagSignature = currentText.slice(firstOpenPos + 2, closeTagInitialPos).trim();
          const tagNameMatch = tagSignature.match(/^(\w+)/);
          const tagName = tagNameMatch ? tagNameMatch[1] : '';

          // Calculate position for this tag
          const tagEndPos = closeTagInitialPos + 2; // Include the closing '%}'
          const localPosition = calculatePosition(
            currentText, 
            firstOpenPos, 
            tagEndPos
          );
          
          // Adjust the position to reflect absolute document position
          const absolutePosition = {
            start: {
              ...localPosition.start,
              offset: localPosition.start.offset + nodeAbsoluteOffset
            },
            end: {
              ...localPosition.end,
              offset: localPosition.end.offset + nodeAbsoluteOffset
            }
          };
          
          // For simple tags, just take the tag and its content
          const simpleTagContent = currentText.slice(firstOpenPos, tagEndPos);
          
          newNodes.push({
            type: 'liquidTag',
            liquidContent: simpleTagContent,
            position: absolutePosition,
            // Store line numbers for easier debugging
            lineNumber: absolutePosition.start.line,
            columnNumber: absolutePosition.start.column,
            children: [],
          } as LiquidTagNode);
          
          cursor = tagEndPos;
        }
      }

      // Only replace the node if actual changes/segmentation occurred
      if (newNodes.length > 0 && !(newNodes.length === 1 && newNodes[0].type === 'text' && (newNodes[0] as TextNode).value === node.value)) {
        // Update the offset map for new nodes
        let currentOffset = nodeAbsoluteOffset;
        for (const newNode of newNodes) {
          positionContext.nodeOffsets.set(newNode, currentOffset);
          if (newNode.type === 'text') {
            currentOffset += (newNode as TextNode).value.length;
          } else if (newNode.type === 'liquidExpression' || newNode.type === 'liquidTag') {
            // Use a type guard instead of simple casting
            const liquidNode = newNode as LiquidExpressionNode | LiquidTagNode;
            currentOffset += liquidNode.liquidContent.length;
          }
        }
        
        parent.children.splice(index, 1, ...newNodes);
        return [SKIP, index + newNodes.length]; // Adjust index for next visit and skip original node
      }
      // If no changes, allow other visitors to process or default behavior.
    });
  };
}

/**
 * Calculate absolute positions for all nodes in the tree
 */
function calculateAbsolutePositions(tree: Node, context: { documentOffset: number, nodeOffsets: Map<Node, number> }) {
  visit(tree, (node: any) => {
    // Store the current document offset for this node
    context.nodeOffsets.set(node, context.documentOffset);
    
    // Update document offset based on node content
    if (node.type === 'text' && typeof node.value === 'string') {
      context.documentOffset += node.value.length;
    }
    
    // For other node types, we rely on their children
    return true; // Continue traversal
  });
}
