import { parseMarkdownLiquid } from '../parsers/markdownLiquid/index.js';
import { visit } from 'unist-util-visit';
import { Node } from 'unist';
import { LiquidNode } from '../parsers/markdownLiquid/types.js';

async function testNestedLiquidParser() {
  // Example with nested Liquid structures - simplified for clearer diagnostics
  const content = `
# Markdown with Liquid Example

## Simple expressions
- Hello {{ user.name | upcase }}
- Total price: {{ cart.total_price | money }}

## Simple tags
{% assign favorite_food = "pizza" %}
My favorite food is {{ favorite_food }}.

## Nested conditional blocks
{% if customer %}
  ## Welcome, {{ customer.name }}!
  {% if customer.orders.size > 0 %}
    You've placed {{ customer.orders.size }} orders with us.
  {% else %}
    You haven't placed any orders yet.
  {% endif %}
{% else %}
  ## Welcome, Guest!
  Please [sign in](/account/login) or [create an account](/account/register).
{% endif %}

## Nested for loops
{% for collection in collections %}
  ### {{ collection.title }}
  {% for product in collection.products limit: 3 %}
    - {{ product.title }} - {{ product.price | money }}
    {% if product.available %}
      - In stock
    {% else %}
      - Sold out
    {% endif %}
  {% endfor %}
{% endfor %}
`;

  console.log("Parsing Markdown with nested Liquid structures...\n");
  try {
    const ast = await parseMarkdownLiquid(content);
    
    // Create a summary of the AST
    const summary = {
      totalNodes: 0,
      nodeTypes: {} as Record<string, number>,
      liquidExpressions: [] as string[],
      liquidTags: [] as string[],
      blockStructures: [] as any[],
      parseErrors: [] as string[],
      allLiquidNodes: [] as LiquidNode[]
    };
    
    // Visit AST to gather information
    visit(ast, (node: Node) => {
      summary.totalNodes++;
      const type = node.type || 'unknown';
      summary.nodeTypes[type] = (summary.nodeTypes[type] || 0) + 1;
      
      if (node.type === 'liquidExpression' || node.type === 'liquidTag') {
        const liquidNode = node as LiquidNode;
        summary.allLiquidNodes.push(liquidNode);
        
        if (node.type === 'liquidExpression') {
          summary.liquidExpressions.push(liquidNode.liquidInnerContent || liquidNode.liquidContent);
        } else { // liquidTag
          summary.liquidTags.push(liquidNode.liquidInnerContent || liquidNode.liquidContent);
        }
        
        if (liquidNode.parseError) {
          summary.parseErrors.push(
            `${node.type}: ${liquidNode.liquidContent}\n` +
            `Error: ${liquidNode.parseError}`
          );
        }
      }
      
      return true;
    });
    
    // Analyze block structures
    analyzeBlockStructures(summary.allLiquidNodes.filter(n => n.type === 'liquidTag'), summary.blockStructures);
    
    // Print summary
    console.log("=== AST Summary ===");
    console.log(`Total nodes: ${summary.totalNodes}`);
    console.log("Node types:");
    Object.entries(summary.nodeTypes).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    
    console.log("\n=== Liquid Expressions ===");
    summary.liquidExpressions.forEach((expr, i) => {
      console.log(`${i + 1}. ${expr}`);
    });
    
    console.log("\n=== Liquid Tags ===");
    summary.liquidTags.forEach((tag, i) => {
      // Truncate very long tags for cleaner output
      const displayTag = tag.length > 100 ? `${tag.substring(0, 100)}...` : tag;
      console.log(`${i + 1}. ${displayTag}`);
    });
    
    console.log("\n=== Block Structures ===");
    summary.blockStructures.forEach((block, i) => {
      console.log(`Block ${i+1}: ${block.type} (ID: ${block.id})`);
      console.log(`  Start: ${block.start}`);
      if (block.continuations.length > 0) {
        console.log(`  Continuations:`);
        block.continuations.forEach((cont: string) => {
          console.log(`    - ${cont}`);
        });
      }
      if (block.end) {
        console.log(`  End: ${block.end}`);
      } else {
        console.log(`  End: <missing>`);
      }
      console.log('');
    });
    
    if (summary.parseErrors.length > 0) {
      console.log("\n=== Parse Messages ===");
      summary.parseErrors.forEach((err, i) => {
        console.log(`Message ${i + 1}:\n${err}\n`);
      });
    } else {
      console.log("\nNo parse errors detected!");
    }
    
    console.log("\nParsing completed. AST generated successfully.");
    
    // Uncomment to see the full AST
    // console.log("\n=== Full AST ===");
    // console.log(JSON.stringify(ast, null, 2));
  } catch (error) {
    console.error("Failed to parse the Markdown/Liquid content:", error);
  }
}

/**
 * Analyze and summarize block structures from liquidTagNodes
 */
function analyzeBlockStructures(liquidTagNodes: LiquidNode[], blockStructures: any[]): void {
  // Create a map of blockIds to help group nodes
  const blockMap: Record<string, { 
    start: LiquidNode, 
    continuations: LiquidNode[],
    end?: LiquidNode 
  }> = {};
  
  // First pass: collect all blocks by ID
  for (const node of liquidTagNodes) {
    const blockId = node.blockId;
    if (!blockId) continue;
    
    const ast = node.liquidAST;
    if (!ast) continue;
    
    if (!blockMap[blockId]) {
      blockMap[blockId] = {
        start: undefined as any,
        continuations: [],
        end: undefined
      };
    }
    
    if (ast.isBlockStart) {
      blockMap[blockId].start = node;
    } else if (ast.isBlockEnd) {
      blockMap[blockId].end = node;
    } else if (ast.isContinuation) {
      blockMap[blockId].continuations.push(node);
    }
  }
  
  // Convert block map to array format for display
  Object.entries(blockMap).forEach(([blockId, blockData]) => {
    // Only add blocks that have a start tag
    if (blockData.start) {
      const startAst = blockData.start.liquidAST;
      const blockType = startAst?.tagName || 'unknown';
      
      blockStructures.push({
        id: blockId,
        type: blockType,
        start: blockData.start.liquidContent,
        continuations: blockData.continuations.map(node => node.liquidContent),
        end: blockData.end?.liquidContent || null
      });
    }
  });
  
  // Sort blocks by ID for consistent display
  blockStructures.sort((a, b) => a.id.localeCompare(b.id));
}

// Run the test function
testNestedLiquidParser().catch(console.error);