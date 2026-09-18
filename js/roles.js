const ROLE_VISUALIZADOR = "Visualizador";
const ROLE_EDITOR = "Editor";
const ROLE_MASTER = "Master";

const ALL_ROLES = [ROLE_VISUALIZADOR, ROLE_EDITOR, ROLE_MASTER];

let currentUserRole = ROLE_VISUALIZADOR;

// Editor and Master can create/change data; Visualizador is read-only.
// This is a UI-level gate for workflow, not a real security boundary — the
// actual access control is each spreadsheet's Google Drive sharing settings.
function canEdit(role) {
  return role === ROLE_EDITOR || role === ROLE_MASTER;
}

function isMaster(role) {
  return role === ROLE_MASTER;
}
