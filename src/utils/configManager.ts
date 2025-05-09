// src/utils/configManager.ts
import { readFile as fsReadFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRootDir = path.resolve(__dirname, '../..');

export const CONFIG_FILE_NAME = "ado_config.json";
export const CONFIG_FILE_PATH = path.resolve(projectRootDir, CONFIG_FILE_NAME);

/**
 * ADO configuration interface for a single organization
 */
export interface AdoConfig {
  pat?: string;
  organization?: string;
  project?: string;
  repository?: string;
  defaultPullRequestId?: string;
}

/**
 * Extended ADO configuration that supports multiple organizations
 */
export interface AdoConfigExtended {
  // Default configuration (when no organizationId is specified)
  default?: AdoConfig;
  
  // Named organization configurations
  organizations?: {
    [organizationId: string]: AdoConfig;
  };
}

/**
 * Attempts to read the Azure DevOps configuration from multiple sources.
 * Returns an object with available configuration values.
 * 
 * @param organizationId Optional organization ID to get specific config
 * @returns The ADO configuration object with available values
 */
export async function getAdoConfig(organizationId?: string): Promise<AdoConfig> {
  // Start with empty config
  const config: AdoConfig = {};
  
  // Try to read from JSON config file first
  try {
    if (existsSync(CONFIG_FILE_PATH)) {
      console.error(`[Config] Found ADO config file at ${CONFIG_FILE_PATH}, attempting to read`);
      const configContent = await fsReadFile(CONFIG_FILE_PATH, { encoding: 'utf-8' });
      
      try {
        const jsonConfig: AdoConfigExtended = JSON.parse(configContent);
        
        // Load default config first if available
        if (jsonConfig.default) {
          Object.assign(config, jsonConfig.default);
          console.error("[Config] Loaded default configuration");
        }
        
        // If a specific organization is requested and exists in config, override defaults
        if (organizationId && jsonConfig.organizations && jsonConfig.organizations[organizationId]) {
          console.error(`[Config] Using organization-specific config for ID: ${organizationId}`);
          const orgConfig = jsonConfig.organizations[organizationId];
          Object.assign(config, orgConfig);
        } 
        
        console.error("[Config] Successfully read ADO configuration from JSON file");
      } catch (parseError) {
        console.error(`[Config] Error parsing JSON configuration: ${parseError}`);
      }
    }
  } catch (error) {
    console.error(`[Config] Error reading ADO config file: ${error}`);
  }

  // Override with environment variables
  const envPrefix = organizationId ? `ADO_${organizationId.toUpperCase()}_` : 'ADO_';
  
  // Try organization-specific environment variables first
  if (process.env[`${envPrefix}PAT`]) {
    console.error(`[Config] Using ${envPrefix}PAT from environment variable`);
    config.pat = process.env[`${envPrefix}PAT`];
  } else if (!organizationId && process.env.ADO_PAT) {
    console.error("[Config] Using ADO_PAT from environment variable");
    config.pat = process.env.ADO_PAT;
  }
  
  if (process.env[`${envPrefix}ORG`]) {
    console.error(`[Config] Using ${envPrefix}ORG from environment variable`);
    config.organization = process.env[`${envPrefix}ORG`];
  } else if (!organizationId && process.env.ADO_ORG) {
    console.error("[Config] Using ADO_ORG from environment variable");
    config.organization = process.env.ADO_ORG;
  }
  
  if (process.env[`${envPrefix}PROJECT`]) {
    console.error(`[Config] Using ${envPrefix}PROJECT from environment variable`);
    config.project = process.env[`${envPrefix}PROJECT`];
  } else if (!organizationId && process.env.ADO_PROJECT) {
    console.error("[Config] Using ADO_PROJECT from environment variable");
    config.project = process.env.ADO_PROJECT;
  }
  
  if (process.env[`${envPrefix}REPO`]) {
    console.error(`[Config] Using ${envPrefix}REPO from environment variable`);
    config.repository = process.env[`${envPrefix}REPO`];
  } else if (!organizationId && process.env.ADO_REPO) {
    console.error("[Config] Using ADO_REPO from environment variable");
    config.repository = process.env.ADO_REPO;
  }
  
  if (process.env[`${envPrefix}PR_ID`]) {
    console.error(`[Config] Using ${envPrefix}PR_ID from environment variable`);
    config.defaultPullRequestId = process.env[`${envPrefix}PR_ID`];
  } else if (!organizationId && process.env.ADO_PR_ID) {
    console.error("[Config] Using ADO_PR_ID from environment variable");
    config.defaultPullRequestId = process.env.ADO_PR_ID;
  }
  
  return config;
}

/**
 * Attempts to read the Azure DevOps Personal Access Token (PAT) from multiple sources.
 * 
 * @param organizationId Optional organization ID to get specific PAT
 * @returns The PAT string if found, null otherwise
 */
export async function getAdoPat(organizationId?: string): Promise<string | null> {
  const config = await getAdoConfig(organizationId);
  return config.pat || null;
}
