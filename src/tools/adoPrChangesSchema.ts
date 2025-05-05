import { z } from "zod";

// Tool schema definition
export const adoPrChangesSchema = z.object({
  pullRequestId: z.string().min(1).regex(/^\d+$/).describe("The numeric ID of the Pull Request (as a string)."),
  organizationId: z.string().min(1).describe("Optional organization identifier to load specific configuration settings.")
});

// Infer the input type from the schema
export type AdoPrChangesInput = z.infer<typeof adoPrChangesSchema>;