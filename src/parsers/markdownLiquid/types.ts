import { Node } from 'unist';

/**
 * Position information for nodes
 */
export interface Position {
  start: {
    line: number;
    column: number;
    offset: number;
  };
  end: {
    line: number;
    column: number;
    offset: number;
  };
}

// Define custom MDAST node types for Liquid
export interface LiquidNode extends Node {
  liquidContent: string;
  liquidAST?: any; // To store the AST from liquidjs
  
  // Node content processing
  originalContent?: string; // The original Liquid content before processing
  liquidInnerContent?: string; // The content without {{ }} or {% %} delimiters
  parseSuccess?: boolean; // Whether parsing succeeded
  parseError?: string; // Error message if parsing failed
  
  // Block structure association
  blockId?: string; // ID for this block (for start tags) or reference to parent block (for continuation/end)
  matchingBlockId?: string; // For end tags, reference to the start tag's blockId
  relatedBlockNodes?: LiquidNode[]; // Related nodes in the same block structure
  
  // Position information
  position?: Position;
  
  // Raw content information for better error reporting
  lineNumber?: number; // Line number in the original document
  columnNumber?: number; // Column number in the original document
}

export interface LiquidExpressionNode extends LiquidNode {
  type: 'liquidExpression';
}

export interface LiquidTagNode extends LiquidNode {
  type: 'liquidTag';
}
