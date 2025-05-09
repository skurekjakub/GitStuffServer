// src/utils/utilities.ts
import * as diffLib from 'diff';

/**
 * Converts a ReadableStream to a string.
 * @param stream The stream to convert.
 * @returns A promise that resolves with the string content of the stream.
 */
export async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

/**
 * Generates a line-by-line diff between two strings using the diff library.
 * @param originalContent The original string content.
 * @param modifiedContent The modified string content.
 * @returns A string representing the diff, with + for additions and - for deletions.
 */
export function generateSimpleDiff(modifiedContent: string, originalContent: string): string {
    const diffResult = diffLib.createPatch('file', originalContent, modifiedContent, 'original', 'modified');
    
    // Remove the header lines (first 4 lines) for a cleaner output
    const diffLines = diffResult.split('\n').slice(4);
    return diffLines.join('\n');
}