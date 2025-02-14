import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

// Get the directory where the script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Config {
    db: {
        root: string;
        path: string;
        timeout: number;
        verbose: boolean;
    };
    server: {
        webUiPort: number;
        wsPort: number;
    };
    features: {
        enableWebsocket: boolean;
        enableFTS: boolean;
    };
}

type PartialDbConfig = Partial<Config['db']>;
type PartialServerConfig = Partial<Config['server']>;
type PartialFeaturesConfig = Partial<Config['features']>;

interface PartialConfig {
    db?: PartialDbConfig;
    server?: PartialServerConfig;
    features?: PartialFeaturesConfig;
}

// Default configuration
const defaultConfig: Config = {
    db: {
        root: process.env.USERPROFILE || process.env.HOME || '',
        path: 'sticky-notes.db',
        timeout: 10000,
        verbose: process.env.NODE_ENV === 'development'
    },
    server: {
        webUiPort: 3000,
        wsPort: 8080
    },
    features: {
        enableWebsocket: true,
        enableFTS: true
    }
};

class Configuration {
    private static instance: Configuration;
    private config: Config;

    private constructor() {
        this.config = this.loadConfig();
    }

    public static getInstance(): Configuration {
        if (!Configuration.instance) {
            Configuration.instance = new Configuration();
        }
        return Configuration.instance;
    }

    private loadConfigFile(): PartialConfig {
        const configPaths = [
            process.env.STICKY_NOTES_CONFIG,
            join(process.cwd(), '.sticky-notes.config.json'),
            join(__dirname, '.sticky-notes.config.json'),           // Check in build/
            join(__dirname, 'public', '.sticky-notes.config.json'), // Check in build/public/
            join(__dirname, '..', '.sticky-notes.config.json'),     // Check in project root
            join(homedir(), 'sticky-notes.config.json'),
            process.platform !== 'win32' ? '/etc/sticky-notes/config.json' : null
        ].filter(Boolean);

        console.error('Searching for config in paths:', configPaths);

        for (const path of configPaths) {
            if (path && existsSync(path)) {
                try {
                    const configFile = readFileSync(path, 'utf8');
                    console.error(`Loading configuration from: ${path}`);
                    return JSON.parse(configFile);
                } catch (error) {
                    console.error(`Error reading config file ${path}:`, error);
                }
            }
        }

        console.error('No configuration file found, using defaults');
        return {};
    }

    private loadEnvironmentVariables(): PartialConfig {
        const envConfig: PartialConfig = {};

        // DB Config
        const dbConfig: PartialDbConfig = {};
        if (process.env.DB_ROOT) dbConfig.root = process.env.DB_ROOT;
        if (process.env.DB_PATH) dbConfig.path = process.env.DB_PATH;
        if (process.env.DB_TIMEOUT) dbConfig.timeout = parseInt(process.env.DB_TIMEOUT, 10);
        if (process.env.DB_VERBOSE !== undefined) dbConfig.verbose = process.env.DB_VERBOSE === 'true';
        if (Object.keys(dbConfig).length > 0) envConfig.db = dbConfig;

        // Server Config
        const serverConfig: PartialServerConfig = {};
        if (process.env.WEB_UI_PORT) serverConfig.webUiPort = parseInt(process.env.WEB_UI_PORT, 10);
        if (process.env.WS_PORT) serverConfig.wsPort = parseInt(process.env.WS_PORT, 10);
        if (Object.keys(serverConfig).length > 0) envConfig.server = serverConfig;

        // Features Config
        const featuresConfig: PartialFeaturesConfig = {};
        if (process.env.ENABLE_WEBSOCKET !== undefined) {
            featuresConfig.enableWebsocket = process.env.ENABLE_WEBSOCKET === 'true';
        }
        if (process.env.ENABLE_FTS !== undefined) {
            featuresConfig.enableFTS = process.env.ENABLE_FTS === 'true';
        }
        if (Object.keys(featuresConfig).length > 0) envConfig.features = featuresConfig;

        return envConfig;
    }

    private mergeConfigs(...configs: PartialConfig[]): Config {
        return configs.reduce<Config>((acc, curr) => {
            return {
                db: {
                    ...acc.db,
                    ...(curr.db || {})
                },
                server: {
                    ...acc.server,
                    ...(curr.server || {})
                },
                features: {
                    ...acc.features,
                    ...(curr.features || {})
                }
            };
        }, defaultConfig);
    }

    private loadConfig(): Config {
        const fileConfig = this.loadConfigFile();
        const envConfig = this.loadEnvironmentVariables();
        return this.mergeConfigs(defaultConfig, fileConfig, envConfig);
    }

    public get(): Config {
        return this.config;
    }
}

export const config = Configuration.getInstance().get();
