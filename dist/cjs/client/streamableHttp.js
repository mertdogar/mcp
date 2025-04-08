"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamableHTTPClientTransport = exports.StreamableHTTPError = void 0;
const types_js_1 = require("../types.js");
const auth_js_1 = require("./auth.js");
class StreamableHTTPError extends Error {
    constructor(code, message, event) {
        super(`Streamable HTTP error: ${message}`);
        this.code = code;
        this.event = event;
    }
}
exports.StreamableHTTPError = StreamableHTTPError;
/**
 * Client transport for Streamable HTTP: this implements the MCP Streamable HTTP transport specification.
 * It will connect to a server using HTTP POST for sending messages and HTTP GET with Server-Sent Events
 * for receiving messages.
 */
class StreamableHTTPClientTransport {
    constructor(url, opts) {
        this._activeStreams = new Map();
        this._url = url;
        this._requestInit = opts === null || opts === void 0 ? void 0 : opts.requestInit;
        this._authProvider = opts === null || opts === void 0 ? void 0 : opts.authProvider;
    }
    async _authThenStart() {
        var _a;
        if (!this._authProvider) {
            throw new auth_js_1.UnauthorizedError("No auth provider");
        }
        let result;
        try {
            result = await (0, auth_js_1.auth)(this._authProvider, { serverUrl: this._url });
        }
        catch (error) {
            (_a = this.onerror) === null || _a === void 0 ? void 0 : _a.call(this, error);
            throw error;
        }
        if (result !== "AUTHORIZED") {
            throw new auth_js_1.UnauthorizedError();
        }
        return await this._startOrAuth();
    }
    async _commonHeaders() {
        const headers = {};
        if (this._authProvider) {
            const tokens = await this._authProvider.tokens();
            if (tokens) {
                headers["Authorization"] = `Bearer ${tokens.access_token}`;
            }
        }
        if (this._sessionId) {
            headers["mcp-session-id"] = this._sessionId;
        }
        return headers;
    }
    async _startOrAuth() {
        var _a, _b, _c;
        try {
            // Try to open an initial SSE stream with GET to listen for server messages
            // This is optional according to the spec - server may not support it
            const commonHeaders = await this._commonHeaders();
            const headers = new Headers(commonHeaders);
            headers.set('Accept', 'text/event-stream');
            // Include Last-Event-ID header for resumable streams
            if (this._lastEventId) {
                headers.set('last-event-id', this._lastEventId);
            }
            const response = await fetch(this._url, {
                method: 'GET',
                headers,
                signal: (_a = this._abortController) === null || _a === void 0 ? void 0 : _a.signal,
            });
            if (response.status === 405) {
                // Server doesn't support GET for SSE, which is allowed by the spec
                // We'll rely on SSE responses to POST requests for communication
                return;
            }
            if (!response.ok) {
                if (response.status === 401 && this._authProvider) {
                    // Need to authenticate
                    return await this._authThenStart();
                }
                const error = new Error(`Failed to open SSE stream: ${response.status} ${response.statusText}`);
                (_b = this.onerror) === null || _b === void 0 ? void 0 : _b.call(this, error);
                throw error;
            }
            // Successful connection, handle the SSE stream as a standalone listener
            const streamId = `initial-${Date.now()}`;
            this._handleSseStream(response.body, streamId);
        }
        catch (error) {
            (_c = this.onerror) === null || _c === void 0 ? void 0 : _c.call(this, error);
            throw error;
        }
    }
    async start() {
        if (this._activeStreams.size > 0) {
            throw new Error("StreamableHTTPClientTransport already started! If using Client class, note that connect() calls start() automatically.");
        }
        this._abortController = new AbortController();
        return await this._startOrAuth();
    }
    /**
     * Call this method after the user has finished authorizing via their user agent and is redirected back to the MCP client application. This will exchange the authorization code for an access token, enabling the next connection attempt to successfully auth.
     */
    async finishAuth(authorizationCode) {
        if (!this._authProvider) {
            throw new auth_js_1.UnauthorizedError("No auth provider");
        }
        const result = await (0, auth_js_1.auth)(this._authProvider, { serverUrl: this._url, authorizationCode });
        if (result !== "AUTHORIZED") {
            throw new auth_js_1.UnauthorizedError("Failed to authorize");
        }
    }
    async close() {
        var _a, _b, _c, _d, _e;
        // Close all active streams
        for (const reader of this._activeStreams.values()) {
            try {
                reader.cancel();
            }
            catch (error) {
                (_a = this.onerror) === null || _a === void 0 ? void 0 : _a.call(this, error);
            }
        }
        this._activeStreams.clear();
        // Abort any pending requests
        (_b = this._abortController) === null || _b === void 0 ? void 0 : _b.abort();
        // If we have a session ID, send a DELETE request to explicitly terminate the session
        if (this._sessionId) {
            try {
                const commonHeaders = await this._commonHeaders();
                const response = await fetch(this._url, {
                    method: "DELETE",
                    headers: commonHeaders,
                    signal: (_c = this._abortController) === null || _c === void 0 ? void 0 : _c.signal,
                });
                if (!response.ok) {
                    // Server might respond with 405 if it doesn't support explicit session termination
                    // We don't throw an error in that case
                    if (response.status !== 405) {
                        const text = await response.text().catch(() => null);
                        throw new Error(`Error terminating session (HTTP ${response.status}): ${text}`);
                    }
                }
            }
            catch (error) {
                // We still want to invoke onclose even if the session termination fails
                (_d = this.onerror) === null || _d === void 0 ? void 0 : _d.call(this, error);
            }
        }
        (_e = this.onclose) === null || _e === void 0 ? void 0 : _e.call(this);
    }
    async send(message) {
        var _a, _b, _c, _d;
        try {
            const commonHeaders = await this._commonHeaders();
            const headers = new Headers({ ...commonHeaders, ...(_a = this._requestInit) === null || _a === void 0 ? void 0 : _a.headers });
            headers.set("content-type", "application/json");
            headers.set("accept", "application/json, text/event-stream");
            const init = {
                ...this._requestInit,
                method: "POST",
                headers,
                body: JSON.stringify(message),
                signal: (_b = this._abortController) === null || _b === void 0 ? void 0 : _b.signal,
            };
            const response = await fetch(this._url, init);
            // Handle session ID received during initialization
            const sessionId = response.headers.get("mcp-session-id");
            if (sessionId) {
                this._sessionId = sessionId;
            }
            if (!response.ok) {
                if (response.status === 401 && this._authProvider) {
                    const result = await (0, auth_js_1.auth)(this._authProvider, { serverUrl: this._url });
                    if (result !== "AUTHORIZED") {
                        throw new auth_js_1.UnauthorizedError();
                    }
                    // Purposely _not_ awaited, so we don't call onerror twice
                    return this.send(message);
                }
                const text = await response.text().catch(() => null);
                throw new Error(`Error POSTing to endpoint (HTTP ${response.status}): ${text}`);
            }
            // If the response is 202 Accepted, there's no body to process
            if (response.status === 202) {
                return;
            }
            // Get original message(s) for detecting request IDs
            const messages = Array.isArray(message) ? message : [message];
            // Extract IDs from request messages for tracking responses
            const requestIds = messages.filter(msg => 'method' in msg && 'id' in msg)
                .map(msg => 'id' in msg ? msg.id : undefined)
                .filter(id => id !== undefined);
            // If we have request IDs and an SSE response, create a unique stream ID
            const hasRequests = requestIds.length > 0;
            // Check the response type
            const contentType = response.headers.get("content-type");
            if (hasRequests) {
                if (contentType === null || contentType === void 0 ? void 0 : contentType.includes("text/event-stream")) {
                    // For streaming responses, create a unique stream ID based on request IDs
                    const streamId = `req-${requestIds.join('-')}-${Date.now()}`;
                    this._handleSseStream(response.body, streamId);
                }
                else if (contentType === null || contentType === void 0 ? void 0 : contentType.includes("application/json")) {
                    // For non-streaming servers, we might get direct JSON responses
                    const data = await response.json();
                    const responseMessages = Array.isArray(data)
                        ? data.map(msg => types_js_1.JSONRPCMessageSchema.parse(msg))
                        : [types_js_1.JSONRPCMessageSchema.parse(data)];
                    for (const msg of responseMessages) {
                        (_c = this.onmessage) === null || _c === void 0 ? void 0 : _c.call(this, msg);
                    }
                }
            }
        }
        catch (error) {
            (_d = this.onerror) === null || _d === void 0 ? void 0 : _d.call(this, error);
            throw error;
        }
    }
    _handleSseStream(stream, streamId) {
        if (!stream) {
            return;
        }
        // Set up stream handling for server-sent events
        const reader = stream.getReader();
        this._activeStreams.set(streamId, reader);
        const decoder = new TextDecoder();
        let buffer = '';
        const processStream = async () => {
            var _a, _b, _c;
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        // Stream closed by server
                        this._activeStreams.delete(streamId);
                        break;
                    }
                    buffer += decoder.decode(value, { stream: true });
                    // Process SSE messages in the buffer
                    const events = buffer.split('\n\n');
                    buffer = events.pop() || '';
                    for (const event of events) {
                        const lines = event.split('\n');
                        let id;
                        let eventType;
                        let data;
                        // Parse SSE message according to the format
                        for (const line of lines) {
                            if (line.startsWith('id:')) {
                                id = line.slice(3).trim();
                            }
                            else if (line.startsWith('event:')) {
                                eventType = line.slice(6).trim();
                            }
                            else if (line.startsWith('data:')) {
                                data = line.slice(5).trim();
                            }
                        }
                        // Update last event ID if provided by server
                        // As per spec: the ID MUST be globally unique across all streams within that session
                        if (id) {
                            this._lastEventId = id;
                        }
                        // Handle message event
                        if (data) {
                            // Default event type is 'message' per SSE spec if not specified
                            if (!eventType || eventType === 'message') {
                                try {
                                    const message = types_js_1.JSONRPCMessageSchema.parse(JSON.parse(data));
                                    (_a = this.onmessage) === null || _a === void 0 ? void 0 : _a.call(this, message);
                                }
                                catch (error) {
                                    (_b = this.onerror) === null || _b === void 0 ? void 0 : _b.call(this, error);
                                }
                            }
                        }
                    }
                }
            }
            catch (error) {
                this._activeStreams.delete(streamId);
                (_c = this.onerror) === null || _c === void 0 ? void 0 : _c.call(this, error);
            }
        };
        processStream();
    }
}
exports.StreamableHTTPClientTransport = StreamableHTTPClientTransport;
//# sourceMappingURL=streamableHttp.js.map