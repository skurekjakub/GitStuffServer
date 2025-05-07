/**
 * Tag classification module responsible for identifying Liquid tag types.
 */

// List of block tags that require matching end tags
export const BLOCK_TAGS = [
  'if', 'unless', 'for', 'case', 'capture', 'tablerow', 
  'raw', 'block', 'paginate', 'schema', 'style', 'form'
];

// List of tags that continue or end blocks (not standalone tags)
export const CONTINUATION_TAGS = [
  'else', 'elsif', 'when', 'endcase', 'endform', 'endpaginate', 'endblock'
];

/**
 * Identifies the tag name from a Liquid tag string
 * @param content The content of a Liquid tag (without delimiters)
 */
export function extractTagName(content: string): string {
  if (!content) return 'unknown';
  const match = content.trim().match(/^(\w+)/);
  return match ? match[1] : 'unknown';
}

/**
 * Checks if a tag is a block tag that requires a closing end tag
 */
export function isBlockStartTag(tagName: string): boolean {
  return BLOCK_TAGS.includes(tagName);
}

/**
 * Checks if a tag is an end tag (e.g., endif, endfor)
 */
export function isBlockEndTag(tagName: string): boolean {
  return tagName.startsWith('end') && BLOCK_TAGS.includes(tagName.substring(3));
}

/**
 * Checks if a tag is a continuation tag (e.g., else, elsif)
 */
export function isContinuationTag(tagName: string): boolean {
  return CONTINUATION_TAGS.includes(tagName);
}

/**
 * Checks if a tag is either a continuation or end tag
 */
export function isContinuationOrEndTag(tagName: string): boolean {
  return isBlockEndTag(tagName) || isContinuationTag(tagName);
}