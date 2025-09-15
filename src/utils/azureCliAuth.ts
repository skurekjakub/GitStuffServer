// src/utils/azureCliAuth.ts
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Interface for Azure CLI access token
 */
export interface AzureCliToken {
    accessToken: string;
    expiresOn: string;
    subscription: string;
    tenant: string;
    tokenType: string;
}

/**
 * Checks if Azure CLI is installed and authenticated
 */
export async function checkAzureCliAuth(): Promise<boolean> {
    try {
        // Check if Azure CLI is installed
        await execAsync('az --version');
        
        // Check if user is logged in
        const { stdout } = await execAsync('az account show');
        const account = JSON.parse(stdout);
        
        return account && account.id;
    } catch (error) {
        return false;
    }
}

/**
 * Gets an access token from Azure CLI for Azure DevOps
 */
export async function getAzureCliAccessToken(organization?: string): Promise<string> {
    try {
        // First check if user is authenticated
        const isAuthenticated = await checkAzureCliAuth();
        if (!isAuthenticated) {
            throw new Error('Azure CLI is not installed or user is not logged in. Please run "az login" first.');
        }

        // Get access token for Azure DevOps
        // Using the Azure DevOps resource ID for the scope
        const { stdout } = await execAsync('az account get-access-token --resource 499b84ac-1321-427f-aa17-267ca6975798');
        const tokenInfo: AzureCliToken = JSON.parse(stdout);
        
        if (!tokenInfo.accessToken) {
            throw new Error('Failed to retrieve access token from Azure CLI');
        }

        return tokenInfo.accessToken;
    } catch (error: any) {
        if (error.message.includes('az account get-access-token')) {
            throw new Error('Failed to get Azure CLI access token. Please ensure you are logged in with "az login" and have access to Azure DevOps.');
        }
        throw error;
    }
}

/**
 * Gets the current Azure CLI account information
 */
export async function getAzureCliAccountInfo(): Promise<any> {
    try {
        const { stdout } = await execAsync('az account show');
        return JSON.parse(stdout);
    } catch (error) {
        throw new Error('Failed to get Azure CLI account information. Please ensure you are logged in with "az login".');
    }
}