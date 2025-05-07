// src/tools/adoPrComment/adoPrCommentSchema.ts
import { z } from 'zod';

export const AdoPrSingleCommentItemSchema = z.object({
  comment: z.string(),
  filePath: z.string().optional(),
  lineNumber: z.number().optional(),
  threadId: z.string().optional(), // Added to allow replying to specific threads in batch
});
export type AdoPrSingleCommentItem = z.infer<typeof AdoPrSingleCommentItemSchema>;

export const AdoPrCommentRequestSchema = z.object({
  organizationId: z.string().optional(),
  pullRequestId: z.number(),
  commentsToPost: z.array(AdoPrSingleCommentItemSchema).min(1, "commentsToPost cannot be empty"), // Now required and must have at least one item
});

export type AdoPrCommentRequest = z.infer<typeof AdoPrCommentRequestSchema>;

export interface IndividualAdoPrCommentResult {
  success: boolean;
  message: string;
  commentId?: string;
  threadId?: string;
  error?: string;
  originalCommentContent?: string; 
  originalFilePath?: string;
  originalThreadId?: string; // To map back if a threadId was provided for reply
}

export interface AdoPrCommentResponse {
  success: boolean; // Overall success of the batch operation
  message: string;
  batchResults: IndividualAdoPrCommentResult[]; // Always return batchResults
}
