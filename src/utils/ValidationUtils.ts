import { createServer } from 'net';

/**
 * Checks if a port is available
 * @param port The port to check
 * @returns Promise that resolves to true if port is available, false otherwise
 */
export const isPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
        const server = createServer();
        server.once('error', () => {
            resolve(false);
        });
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
};

/**
 * Finds the next available port starting from the given port
 * @param startPort The port to start scanning from
 * @param maxAttempts Maximum number of ports to try (default: 100)
 * @returns Promise that resolves to the first available port, or null if none found
 */
export const findAvailablePort = async (startPort: number, maxAttempts: number = 100): Promise<number | null> => {
    for (let port = startPort; port < startPort + maxAttempts; port++) {
        if (await isPortAvailable(port)) {
            return port;
        }
    }
    return null;
}; 