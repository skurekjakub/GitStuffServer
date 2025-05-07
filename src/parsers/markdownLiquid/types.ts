import { Node } from 'unist';

// Define custom MDAST node types for Liquid
export interface LiquidNode extends Node {
  liquidContent: string;
  liquidAST?: any; // To store the AST from liquidjs
  
  // New fields for better error handling and content processing
  originalContent?: string; // The original Liquid content before processing
  liquidInnerContent?: string; // The content without {{ }} or {% %} delimiters
  parseSuccess?: boolean; // Whether parsing succeeded
  parseError?: string; // Error message if parsing failed
}

export interface LiquidExpressionNode extends LiquidNode {
  type: 'liquidExpression';
}

export interface LiquidTagNode extends LiquidNode {
  type: 'liquidTag';
}
