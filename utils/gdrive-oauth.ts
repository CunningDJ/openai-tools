import "../env";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import type { Socket } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { CodeChallengeMethod } from "google-auth-library";

const googleDriveUploadScope = "https://www.googleapis.com/auth/drive.file";
const repoRootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const oauthClientFile = path.join(repoRootDir, "google-oauth-client.json");
const oauthTokenFile = path.join(repoRootDir, "google-oauth-token.json");

export async function getGoogleDriveAuth() {
  const clientConfig = await readOAuthClientConfig();
  const oauthClient = new google.auth.OAuth2(
    clientConfig.clientId,
    clientConfig.clientSecret,
  );
  const savedToken = await readSavedOAuthToken();

  if (savedToken) {
    oauthClient.setCredentials(savedToken);
    return oauthClient;
  }

  const { code, redirectUri, codeVerifier } =
    await authorizeWithBrowser(oauthClient);
  const tokenResponse = await oauthClient.getToken({
    code,
    codeVerifier,
    redirect_uri: redirectUri,
  });

  oauthClient.setCredentials(tokenResponse.tokens);
  await fs.writeFile(
    oauthTokenFile,
    JSON.stringify(tokenResponse.tokens, null, 2),
  );
  return oauthClient;
}

type OAuthClientConfig = {
  clientId: string;
  clientSecret?: string;
};

type OAuthClientJson = {
  installed?: {
    client_id?: string;
    client_secret?: string;
  };
  web?: {
    client_id?: string;
    client_secret?: string;
  };
};

async function readOAuthClientConfig(): Promise<OAuthClientConfig> {
  const rawClient = await fs.readFile(oauthClientFile, "utf8").catch(() => {
    throw new Error(
      `Missing Google OAuth client file: ${oauthClientFile}. Create a Desktop OAuth client in Google Cloud and save its JSON here.`,
    );
  });
  const parsed = JSON.parse(rawClient) as OAuthClientJson;
  const credentials = parsed.installed ?? parsed.web;
  const clientId = credentials?.client_id;

  if (!clientId) {
    throw new Error(
      `Invalid Google OAuth client file: ${oauthClientFile}. Expected a Desktop OAuth client JSON file.`,
    );
  }

  return {
    clientId,
    clientSecret: credentials.client_secret,
  };
}

async function readSavedOAuthToken() {
  const rawToken = await fs
    .readFile(oauthTokenFile, "utf8")
    .catch(() => undefined);
  return rawToken === undefined ? undefined : JSON.parse(rawToken);
}

async function authorizeWithBrowser(
  oauthClient: InstanceType<typeof google.auth.OAuth2>,
): Promise<{
  code: string;
  redirectUri: string;
  codeVerifier: string;
}> {
  const { codeVerifier, codeChallenge } =
    await oauthClient.generateCodeVerifierAsync();

  return new Promise((resolve, reject) => {
    let serverOrigin = "";
    let redirectUri = "";
    const sockets = new Set<Socket>();
    const closeServer = () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close();
    };
    const server = http.createServer((request, response) => {
      const requestUrl = new URL(
        request.url ?? "/",
        serverOrigin || "http://127.0.0.1",
      );

      if (requestUrl.pathname !== "/oauth2callback") {
        response.writeHead(404).end();
        return;
      }

      const error = requestUrl.searchParams.get("error");
      const code = requestUrl.searchParams.get("code");

      if (error || !code) {
        response.writeHead(400).end("Google authorization failed.");
        closeServer();
        reject(new Error(error ?? "Missing Google OAuth authorization code"));
        return;
      }

      response
        .writeHead(200, { "content-type": "text/plain" })
        .end("Google Drive authorization complete. You can close this tab.");
      closeServer();
      resolve({
        code,
        redirectUri,
        codeVerifier,
      });
    });

    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      serverOrigin = getServerOrigin(server);
      redirectUri = `${serverOrigin}/oauth2callback`;
      const authUrl = oauthClient.generateAuthUrl({
        access_type: "offline",
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        prompt: "consent",
        redirect_uri: redirectUri,
        scope: [googleDriveUploadScope],
      });

      console.log("Authorize Google Drive access in your browser:");
      console.log(authUrl);
      if (process.env.GOOGLE_DRIVE_OAUTH_NO_BROWSER === "1") {
        console.log(
          "Open this URL in a browser that can reach this local callback URL.",
        );
        return;
      }

      openBrowser(authUrl);
    });
  });
}

function getServerOrigin(server: http.Server): string {
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Google OAuth callback server is not listening");
  }

  return `http://127.0.0.1:${address.port}`;
}

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });

  child.on("error", () => undefined);
  child.unref();
}
