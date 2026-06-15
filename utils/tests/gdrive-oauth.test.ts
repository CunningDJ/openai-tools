import { EventEmitter } from "node:events";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServer: vi.fn(),
  fsReadFile: vi.fn(),
  fsWriteFile: vi.fn(),
  oauthClient: {
    generateAuthUrl: vi.fn(),
    generateCodeVerifierAsync: vi.fn(),
    getToken: vi.fn(),
    setCredentials: vi.fn(),
  },
  oauthClientConstructor: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: mocks.spawn,
}));

vi.mock("node:fs/promises", () => ({
  default: {
    readFile: mocks.fsReadFile,
    writeFile: mocks.fsWriteFile,
  },
}));

vi.mock("node:http", () => ({
  default: {
    createServer: mocks.createServer,
  },
}));

vi.mock("google-auth-library", () => ({
  CodeChallengeMethod: {
    S256: "S256",
  },
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        constructor(clientId: string, clientSecret?: string) {
          mocks.oauthClientConstructor(clientId, clientSecret);
          return mocks.oauthClient;
        }
      },
    },
  },
}));

const { getGoogleDriveAuth } = await import("../gdrive-oauth");

const authUrl = "https://auth.example";
const clientId = "client-id";
const clientSecret = "client-secret";
const codeChallenge = "challenge";
const codeVerifier = "verifier";
const oauthCode = "auth-code";
const oauthPort = 12345;
const redirectUri = `http://127.0.0.1:${oauthPort}/oauth2callback`;
const savedToken = { access_token: "saved-token" };
const newToken = { access_token: "new-token" };
const oauthClientJson = JSON.stringify({
  installed: {
    client_id: clientId,
    client_secret: clientSecret,
  },
});

type OAuthCallbackHandler = (
  request: http.IncomingMessage,
  response: http.ServerResponse,
) => void;

function mockOAuthFiles(token?: object): void {
  mocks.fsReadFile.mockImplementation((filePath: string) => {
    if (filePath.endsWith("google-oauth-client.json")) {
      return Promise.resolve(oauthClientJson);
    }

    if (token && filePath.endsWith("google-oauth-token.json")) {
      return Promise.resolve(JSON.stringify(token));
    }

    return Promise.reject(new Error(`No mocked file: ${filePath}`));
  });
}

function mockCodeVerifier(): void {
  mocks.oauthClient.generateCodeVerifierAsync.mockResolvedValue({
    codeChallenge,
    codeVerifier,
  });
}

function mockBrowserAuthUrl(): void {
  mocks.oauthClient.generateAuthUrl.mockReturnValue(authUrl);
}

function mockTokenExchange(): void {
  mocks.oauthClient.getToken.mockResolvedValue({
    tokens: newToken,
  });
}

function mockOAuthServer(): {
  getRequestHandler: () => OAuthCallbackHandler | undefined;
  server: http.Server;
} {
  let requestHandler: OAuthCallbackHandler | undefined;
  const server = Object.assign(new EventEmitter(), {
    address: vi.fn(() => ({ port: oauthPort })),
    close: vi.fn(),
    listen: vi.fn(
      (_port: number, _hostname: string, callback: () => void) => {
        callback();
        return server;
      },
    ),
  }) as unknown as http.Server;

  mocks.createServer.mockImplementation((handler: OAuthCallbackHandler) => {
    requestHandler = handler;
    return server;
  });

  return {
    getRequestHandler: () => requestHandler,
    server,
  };
}

function createOAuthCallbackRequest(code: string): http.IncomingMessage {
  return { url: `/oauth2callback?code=${code}` } as http.IncomingMessage;
}

function createOAuthCallbackResponse(): http.ServerResponse {
  const response = {
    end: vi.fn(),
    writeHead: vi.fn(),
  };

  response.writeHead.mockReturnValue(response);
  return response as unknown as http.ServerResponse;
}

describe("getGoogleDriveAuth", () => {
  beforeEach(() => {
    delete process.env.GOOGLE_DRIVE_OAUTH_NO_BROWSER;

    mocks.createServer.mockReset();
    mocks.fsReadFile.mockReset();
    mocks.fsWriteFile.mockReset();
    mocks.oauthClient.generateAuthUrl.mockReset();
    mocks.oauthClient.generateCodeVerifierAsync.mockReset();
    mocks.oauthClient.getToken.mockReset();
    mocks.oauthClient.setCredentials.mockReset();
    mocks.oauthClientConstructor.mockReset();
    mocks.spawn.mockReset();
    mocks.spawn.mockReturnValue({
      on: vi.fn(),
      unref: vi.fn(),
    });
  });

  it("uses a saved OAuth token without starting browser authorization", async () => {
    mockOAuthFiles(savedToken);

    await expect(getGoogleDriveAuth()).resolves.toBe(mocks.oauthClient);

    expect(mocks.oauthClientConstructor).toHaveBeenCalledWith(
      clientId,
      clientSecret,
    );
    expect(mocks.oauthClient.setCredentials).toHaveBeenCalledWith(savedToken);
    expect(mocks.createServer).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("starts browser authorization when no saved token exists", async () => {
    const { getRequestHandler, server } = mockOAuthServer();
    mockOAuthFiles();
    mockCodeVerifier();
    mockBrowserAuthUrl();
    mockTokenExchange();

    const authPromise = getGoogleDriveAuth();
    await vi.waitFor(() => expect(getRequestHandler()).toBeDefined());
    getRequestHandler()?.(
      createOAuthCallbackRequest(oauthCode),
      createOAuthCallbackResponse(),
    );

    await expect(authPromise).resolves.toBe(mocks.oauthClient);

    expect(mocks.oauthClient.generateAuthUrl).toHaveBeenCalledWith({
      access_type: "offline",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "consent",
      redirect_uri: redirectUri,
      scope: ["https://www.googleapis.com/auth/drive.file"],
    });
    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(mocks.spawn.mock.calls[0]?.flat(2)).toContain(authUrl);
    expect(mocks.oauthClient.getToken).toHaveBeenCalledWith({
      code: oauthCode,
      codeVerifier,
      redirect_uri: redirectUri,
    });
    expect(mocks.oauthClient.setCredentials).toHaveBeenCalledWith(newToken);
    expect(mocks.fsWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("google-oauth-token.json"),
      JSON.stringify(newToken, null, 2),
    );
    expect(server.close).toHaveBeenCalledOnce();
  });
});
