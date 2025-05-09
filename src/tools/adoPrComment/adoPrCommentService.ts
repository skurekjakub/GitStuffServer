// src/tools/adoPrComment/adoPrCommentService.ts
import * as GitInterfaces from "azure-devops-node-api/interfaces/GitInterfaces.js";
import { getAdoConfig } from "../../utils/configManager.js";
import {
  AdoPrCommentRequest,
  AdoPrCommentResponse,
  AdoPrSingleCommentItem,
  IndividualAdoPrCommentResult
} from "./adoPrCommentSchema.js";
import fetch from 'node-fetch';

const ADO_API_VERSION = "7.1-preview.1"; // Or your desired API version

async function postSingleAdoPrComment(
  config: any, // Consider defining a type for config
  pullRequestId: number,
  commentItem: AdoPrSingleCommentItem,
): Promise<IndividualAdoPrCommentResult> {
  const { comment, filePath, lineNumber, threadId } = commentItem; // threadId is now from commentItem

  let formattedComment = comment;
  if (filePath) {
    formattedComment = filePath ? `**File: ${filePath}` : '';
    formattedComment += lineNumber ? ` (Line: ${lineNumber})**\n\n` : '**\n\n';
    formattedComment += comment;
  }

  // Construct the API URL
  const apiUrl = threadId
    ? `https://dev.azure.com/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${pullRequestId}/threads/${threadId}/comments?api-version=${ADO_API_VERSION}`
    : `https://dev.azure.com/${config.organization}/${config.project}/_apis/git/repositories/${config.repository}/pullRequests/${pullRequestId}/threads?api-version=${ADO_API_VERSION}`;

  const requestBody = threadId
    ? { // Body for replying to a comment
        content: formattedComment,
        commentType: 1, // 1 for text
      }
    : { // Body for creating a new thread with a comment
        comments: [
          {
            parentCommentId: 0,
            content: formattedComment,
            commentType: 1, // 1 for text
          },
        ],
        status: 1, // 1 for Active.
      };

  if (!threadId && filePath) {
    (requestBody as any).threadContext = {
      filePath: filePath,
      rightFileEnd: lineNumber ? { line: lineNumber, offset: 1 } : undefined,
      rightFileStart: lineNumber ? { line: lineNumber, offset: 1 } : undefined,
    };
  }

  console.error(`[ADO Comment] Posting to: ${apiUrl}`);
  console.error(`[ADO Comment] Request body: ${JSON.stringify(requestBody, null, 2)}`);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`:${config.pat}`).toString('base64')}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ADO Comment] API Error ${response.status}: ${errorText}`);
      return {
        success: false,
        message: `Azure DevOps API request failed with status ${response.status}.`,
        error: errorText,
        originalCommentContent: comment,
        originalFilePath: filePath,
        originalThreadId: threadId, // Pass back original threadId
      };
    }

    const responseData: any = await response.json();
    console.error(`[ADO Comment] API Success: ${JSON.stringify(responseData, null, 2)}`);

    return {
      success: true,
      message: threadId ? "Successfully replied to comment." : "Successfully posted new comment thread.",
      commentId: threadId ? responseData.id : responseData.comments[0]?.id,
      threadId: threadId ? threadId : responseData.id,
      originalCommentContent: comment,
      originalFilePath: filePath,
      originalThreadId: threadId, // Pass back original threadId
    };
  } catch (error: any) {
    console.error(`[ADO Comment] Error in postSingleAdoPrComment: ${error.message}`, error);
    return {
      success: false,
      message: "Failed to post comment due to an internal error during API call.",
      error: error.message,
      originalCommentContent: comment,
      originalFilePath: filePath,
      originalThreadId: threadId, // Pass back original threadId
    };
  }
}


/**
 * Posts one or more comments to an Azure DevOps Pull Request.
 */
export async function postAdoPrComment(
  request: AdoPrCommentRequest
): Promise<AdoPrCommentResponse> {
  const { organizationId, pullRequestId, commentsToPost } = request;

  try {
    const config = await getAdoConfig(organizationId);

    if (!config.pat) {
      return { success: false, message: "Azure DevOps PAT not configured.", batchResults: [] };
    }
    if (!config.organization) {
      return { success: false, message: "Azure DevOps organization not configured.", batchResults: [] };
    }
    if (!config.project) {
      return { success: false, message: "Azure DevOps project not configured.", batchResults: [] };
    }
    if (!config.repository) {
      return { success: false, message: "Azure DevOps repository not configured.", batchResults: [] };
    }

    // Always handle batch comments as commentsToPost is now mandatory and validated to be non-empty
    const batchResults: IndividualAdoPrCommentResult[] = [];
    for (const singleCommentItem of commentsToPost) {
      const result = await postSingleAdoPrComment(config, pullRequestId, singleCommentItem);
      batchResults.push(result);
    }
    const allSuccessful = batchResults.every(r => r.success);
    return {
      success: allSuccessful,
      message: allSuccessful ? "All comments posted successfully." : "Some comments failed to post.",
      batchResults: batchResults,
    };

  } catch (error: any) {
    console.error(`[ADO Comment Service] Error: ${error.message}`, error);
    return {
      success: false,
      message: "Failed to process comment request due to an internal error.",
      batchResults: commentsToPost ? commentsToPost.map(item => ({
        success: false,
        message: "Failed due to a service-level internal error.",
        error: error.message,
        originalCommentContent: item.comment,
        originalFilePath: item.filePath,
        originalThreadId: item.threadId,
      })) : [], 
    };
  }
}
