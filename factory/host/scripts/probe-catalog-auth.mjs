import {
  cookieHeaderFromSetCookie,
  factoryFetch,
  factoryOrigin,
  readRpcBody,
} from "./probe-catalog-http.mjs";

const REDIRECT_URI = "http://127.0.0.1/callback";
const LEADING_QUESTION = /^\?/;
const BASE64URL_PAD = /[=]+$/;

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64URL_PAD, "");
}

async function pkce() {
  const verifier = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) };
}

function restoreSignedOAuthQuery(rawSearch) {
  const params = new URLSearchParams(rawSearch);
  const baParam = params.get("ba_param");
  if (!baParam?.startsWith("[")) {
    return params.toString();
  }
  let names;
  try {
    names = JSON.parse(baParam);
  } catch {
    return params.toString();
  }
  if (!Array.isArray(names)) {
    return params.toString();
  }
  params.delete("ba_param");
  for (const name of names) {
    if (typeof name === "string") {
      params.append("ba_param", name);
    }
  }
  return params.toString();
}

export async function signInFactory(env, origin = factoryOrigin(env)) {
  const email = env.SFAB_LITE_EMAIL;
  const password = env.SFAB_LITE_PASSWORD;
  if (!(email && password)) {
    throw new Error(
      "probe-catalog — --live needs ADMIN_TOKEN or SFAB_LITE_EMAIL + SFAB_LITE_PASSWORD"
    );
  }
  const res = await factoryFetch(`${origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({ email, password }),
  });
  const cookie = cookieHeaderFromSetCookie(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
  if (!res.ok || !cookie) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `probe-catalog — sign-in failed (${res.status}): ${text.slice(0, 240)}`
    );
  }
  return cookie;
}

export async function mintMcpAccessToken({ origin, cookie, organizationId }) {
  const resource = `${origin}/mcp`;
  const register = await factoryFetch(`${origin}/api/auth/oauth2/register`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
    },
    body: JSON.stringify({
      client_name: "probe-catalog",
      redirect_uris: [REDIRECT_URI],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      application_type: "native",
    }),
  });
  const registered = await readRpcBody(register);
  const clientId = registered?.client_id;
  if (!register.ok || !clientId) {
    throw new Error(
      `probe-catalog — DCR failed (${register.status}): ${JSON.stringify(registered).slice(0, 240)}`
    );
  }

  const { challenge, verifier } = await pkce();
  const authorizeUrl = new URL(`${origin}/api/auth/oauth2/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("scope", "openid");
  authorizeUrl.searchParams.set("state", crypto.randomUUID());
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("resource", resource);

  const authorize = await factoryFetch(authorizeUrl.toString(), {
    headers: { cookie, origin },
    redirect: "manual",
  });
  const location = authorize.headers.get("location");
  let consentHref = location;
  if (!consentHref) {
    const body = await readRpcBody(authorize);
    if (typeof body?.url === "string") {
      consentHref = body.url;
    } else {
      throw new Error(
        `probe-catalog — authorize missing redirect (${authorize.status}): ${JSON.stringify(body).slice(0, 240)}`
      );
    }
  }
  const consentUrl = new URL(consentHref, origin);
  if (!consentUrl.pathname.endsWith("/mcp/consent")) {
    throw new Error(`probe-catalog — authorize redirected to ${consentUrl.pathname}`);
  }
  const oauthQuery = restoreSignedOAuthQuery(
    consentUrl.search.replace(LEADING_QUESTION, "")
  );

  const consent = await factoryFetch(`${origin}/api/mcp/consent`, {
    method: "POST",
    headers: {
      cookie,
      origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      oauth_query: oauthQuery,
      organizationId,
      accept: true,
    }),
  });
  const consented = await readRpcBody(consent);
  if (!consent.ok || !consented?.url) {
    throw new Error(
      `probe-catalog — consent failed (${consent.status}): ${JSON.stringify(consented).slice(0, 240)}`
    );
  }
  const code = new URL(consented.url).searchParams.get("code");
  if (!code) {
    throw new Error("probe-catalog — consent redirect missing code");
  }

  const tokenRes = await factoryFetch(`${origin}/api/auth/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier,
      resource,
    }),
  });
  const tokenBody = await readRpcBody(tokenRes);
  if (!tokenRes.ok || !tokenBody?.access_token) {
    throw new Error(
      `probe-catalog — token failed (${tokenRes.status}): ${JSON.stringify(tokenBody).slice(0, 240)}`
    );
  }
  return tokenBody.access_token;
}
