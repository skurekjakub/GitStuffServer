// src/tools/adoPrComment/adoPrComment.ts
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AdoPrCommentRequest, AdoPrCommentResponse, IndividualAdoPrCommentResult } from "./adoPrCommentSchema.js";
import { postAdoPrComment } from "./adoPrCommentService.js";

const adoPrCommentTool = async (
  request: AdoPrCommentRequest
): Promise<CallToolResult> => {
  console.log("[AdoPrCommentTool] Received request:", request);
  let toolResponse: AdoPrCommentResponse;
  try {
    // Validate required parameters
    if (!request.pullRequestId) {
      toolResponse = { 
        success: false, 
        message: "Missing required parameter: pullRequestId", 
        batchResults: [] 
      };
      return { content: [{ type: "text", text: JSON.stringify(toolResponse) }] };
    }
    // commentsToPost is now mandatory and schema validation (min(1)) should catch if it's missing or empty.
    // The Zod schema parsing by the SDK should handle this before it even gets here if not provided.
    // However, an explicit check can be kept for robustness if desired, though it might be redundant.
    if (!request.commentsToPost || request.commentsToPost.length === 0) {
      toolResponse = { 
        success: false, 
        message: "Missing or empty required parameter: commentsToPost", 
        batchResults: [] 
      };
      return { content: [{ type: "text", text: JSON.stringify(toolResponse) }] };
    }

    const result = await postAdoPrComment(request);
    console.log("[AdoPrCommentTool] Service response:", result);
    toolResponse = result;

  } catch (error: any) {
    console.error("[AdoPrCommentTool] Error:", error);
    // Ensure batchResults is initialized in the catch block for consistency
    const batchResultsOnError: IndividualAdoPrCommentResult[] = request.commentsToPost?.map(item => ({
      success: false,
      message: "An unexpected error occurred in the AdoPrCommentTool.",
      error: error.message,
      originalCommentContent: item.comment,
      originalFilePath: item.filePath,
      originalThreadId: item.threadId,
    })) || [];
    toolResponse = {
      success: false,
      message: "An unexpected error occurred in the AdoPrCommentTool.",
      batchResults: batchResultsOnError,
    };
  }
  return { content: [{ type: "text", text: JSON.stringify(toolResponse) }] };
};

export default adoPrCommentTool;
