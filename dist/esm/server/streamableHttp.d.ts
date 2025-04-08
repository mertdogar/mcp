import { IncomingMessage, ServerResponse } from "node:http";
import { Transport } from "../shared/transport.js";
import { JSONRPCMessage, RequestId } from "../types.js";
/**
 * Configuration options for StreamableHTTPServerTransport
 */
export interface StreamableHTTPServerTransportOptions {
    /**
     * Function that generates a session ID for the transport.
     * The session ID SHOULD be globally unique and cryptographically secure (e.g., a securely generated UUID, a JWT, or a cryptographic hash)
     *
     * Return undefined to disable session management.
     */
    sessionIdGenerator: () => string | undefined;
}
/**
 * Server transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
 * It supports both SSE streaming and direct HTTP responses.
 *
 * Usage example:
 *
 * ```typescript
 * // Stateful mode - server sets the session ID
 * const statefulTransport = new StreamableHTTPServerTransport({
 *  sessionId: randomUUID(),
 * });
 *
 * // Stateless mode - explicitly set session ID to undefined
 * const statelessTransport = new StreamableHTTPServerTransport({
 *    sessionId: undefined,
 * });
 *
 * // Using with pre-parsed request body
 * app.post('/mcp', (req, res) => {
 *   transport.handleRequest(req, res, req.body);
 * });
 * ```
 *
 * In stateful mode:
 * - Session ID is generated and included in response headers
 * - Session ID is always included in initialization responses
 * - Requests with invalid session IDs are rejected with 404 Not Found
 * - Non-initialization requests without a session ID are rejected with 400 Bad Request
 * - State is maintained in-memory (connections, message history)
 *
 * In stateless mode:
 * - Session ID is only included in initialization responses
 * - No session validation is performed
 */
export declare class StreamableHTTPServerTransport implements Transport {
    private sessionIdGenerator;
    private _started;
    private _sseResponseMapping;
    private _initialized;
    sessionId?: string | undefined;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (message: JSONRPCMessage) => void;
    constructor(options: StreamableHTTPServerTransportOptions);
    /**
     * Starts the transport. This is required by the Transport interface but is a no-op
     * for the Streamable HTTP transport as connections are managed per-request.
     */
    start(): Promise<void>;
    /**
     * Handles an incoming HTTP request, whether GET or POST
     */
    handleRequest(req: IncomingMessage, res: ServerResponse, parsedBody?: unknown): Promise<void>;
    /**
     * Handles unsupported requests (GET, PUT, PATCH, etc.)
     * For now we support only POST and DELETE requests. Support for GET for SSE connections will be added later.
     */
    private handleUnsupportedRequest;
    /**
     * Handles POST requests containing JSON-RPC messages
     */
    private handlePostRequest;
    /**
     * Handles DELETE requests to terminate sessions
     */
    private handleDeleteRequest;
    /**
     * Validates session ID for non-initialization requests
     * Returns true if the session is valid, false otherwise
     */
    private validateSession;
    close(): Promise<void>;
    send(message: JSONRPCMessage, options?: {
        relatedRequestId?: RequestId;
    }): Promise<void>;
}
//# sourceMappingURL=streamableHttp.d.ts.map