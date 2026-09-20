let tokenClient = null;
let accessToken = null;

const SESSION_TOKEN_KEY = "ipanema_gis_access_token";
const SESSION_EXPIRES_KEY = "ipanema_gis_token_expires_at";

function waitForGoogleIdentity(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Tempo esgotado ao carregar o Google Identity Services."));
        return;
      }
      setTimeout(check, 50);
    })();
  });
}

function saveTokenToSession(token, expiresInSeconds) {
  try {
    sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    sessionStorage.setItem(SESSION_EXPIRES_KEY, String(Date.now() + expiresInSeconds * 1000));
  } catch (err) {
    console.warn("Não foi possível salvar a sessão:", err);
  }
}

// Returns a still-valid token from this tab's session, or null.
function loadValidTokenFromSession() {
  try {
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    const expiresAt = Number(sessionStorage.getItem(SESSION_EXPIRES_KEY) || 0);
    const safetyMarginMs = 30_000;
    if (token && expiresAt > Date.now() + safetyMarginMs) {
      accessToken = token;
      return token;
    }
  } catch (err) {
    console.warn("Não foi possível ler a sessão:", err);
  }
  return null;
}

function clearTokenSession() {
  try {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_EXPIRES_KEY);
  } catch (err) {
    // ignore
  }
  accessToken = null;
}

async function initAuth(onSignedIn) {
  await waitForGoogleIdentity();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (response) => {
      if (response.error) {
        console.error("Erro de autenticação com o Google:", response);
        return;
      }
      accessToken = response.access_token;
      saveTokenToSession(accessToken, response.expires_in);
      onSignedIn(accessToken);
    },
  });
}

function requestAccessToken() {
  if (!tokenClient) {
    console.error("Token client do Google ainda não está pronto.");
    return;
  }
  tokenClient.requestAccessToken();
}

async function getTokenScopes(token) {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
  // 4xx = Google says the token is not valid (null). 5xx / 429 = Google is having a
  // moment: that is NOT a reason to sign the person out, so it is reported as a failure to retry.
  if (response.status >= 500 || response.status === 429) {
    const falha = new Error(`O Google não respondeu agora (${response.status}).`);
    falha.status = response.status;
    throw falha;
  }
  if (!response.ok) return null;
  const data = await response.json();
  return data.scope || "";
}

function hasAllScopes(grantedScopeString, requiredScopeString) {
  const granted = new Set(grantedScopeString.split(" ").filter(Boolean));
  return requiredScopeString
    .split(" ")
    .filter(Boolean)
    .every((scope) => granted.has(scope));
}

async function fetchUserEmail(token) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorBody = await response.text();
    const falha = new Error(`Falha ao identificar a conta Google (${response.status}): ${errorBody}`);
    falha.status = response.status;
    throw falha;
  }
  const data = await response.json();
  return data.email;
}

function signOut() {
  const token = accessToken;
  clearTokenSession();
  if (token && window.google && google.accounts && google.accounts.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
}
