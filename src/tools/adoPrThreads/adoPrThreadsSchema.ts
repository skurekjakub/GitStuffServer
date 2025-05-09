// src/tools/adoPrThreads/adoPrThreadsSchema.ts
import { z } from "zod";

// Schema for the tool input
export const AdoPrThreadsRequestSchema = z.object({
  pullRequestId: z.string().min(1).regex(/^\d+$/, "pullRequestId must be a numeric string.")
    .describe("The numeric ID of the Pull Request (as a string)."),
  organizationId: z.string().min(1).optional()
    .describe("Optional organization identifier to load specific configuration settings."),
});

export type AdoPrThreadsRequest = z.infer<typeof AdoPrThreadsRequestSchema>;

// We'll use the GitPullRequestCommentThread interface from azure-devops-node-api for the response structure,
// so no explicit response schema is defined here, but the tool will return an array of these.
