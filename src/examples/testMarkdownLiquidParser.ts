import { parseMarkdownLiquid } from '../parsers/markdownLiquid/index.js';
import { visit } from 'unist-util-visit';
import { Node } from 'unist';
import { LiquidNode } from '../parsers/markdownLiquid/types.js';

async function testNestedLiquidParser() {
  // Example with nested Liquid structures
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
    {% if customer.orders.last.created_at > 30.days.ago %}
      Your last order was placed recently.
    {% endif %}
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
      parseErrors: [] as string[]
    };
    
    // Visit AST to gather information
    visit(ast, (node: Node) => {
      summary.totalNodes++;
      const type = node.type || 'unknown';
      summary.nodeTypes[type] = (summary.nodeTypes[type] || 0) + 1;
      
      if (node.type === 'liquidExpression' || node.type === 'liquidTag') {
        const liquidNode = node as LiquidNode;
        
        if (node.type === 'liquidExpression') {
          summary.liquidExpressions.push(liquidNode.liquidInnerContent || liquidNode.liquidContent);
        } else { // liquidTag
          summary.liquidTags.push(liquidNode.liquidInnerContent || liquidNode.liquidContent);
        }
        
        if (liquidNode.parseError) {
          summary.parseErrors.push(
            `Failed to parse ${node.type}: ${liquidNode.liquidContent}\n` +
            `Error: ${liquidNode.parseError}`
          );
        }
      }
      
      return true;
    });
    
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
    
    if (summary.parseErrors.length > 0) {
      console.log("\n=== Parse Errors ===");
      summary.parseErrors.forEach((err, i) => {
        console.log(`Error ${i + 1}:\n${err}\n`);
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

// Run the test function
testNestedLiquidParser().catch(console.error);