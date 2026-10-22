import { workspaceSchema, newWorkspace, type Workspace } from "./model";

export const STORAGE_KEY = "mmf-studio.workspace.v1";
export const BACKUP_KEY = "mmf-studio.previous.v1";
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function parseWorkspace(text: string): Workspace {
  if (text.length > MAX_IMPORT_BYTES) throw new Error("Backup exceeds the 10 MB limit.");
  return workspaceSchema.parse(JSON.parse(text));
}

export interface LoadedWorkspace {
  workspace: Workspace;
  error: string | null;
  blocked: boolean;
}

export function loadWorkspace(storage: Pick<Storage, "getItem">): LoadedWorkspace {
  try {
    const saved = storage.getItem(STORAGE_KEY);
    return {
      workspace: saved ? parseWorkspace(saved) : newWorkspace(),
      error: null,
      blocked: false,
    };
  } catch {
    return {
      workspace: newWorkspace(),
      blocked: true,
      error:
        "Saved data could not be read. It has not been overwritten. Export the original recovery data or restore the previous saved copy before editing.",
    };
  }
}

export function saveWorkspace(
  storage: Pick<Storage, "getItem" | "setItem">,
  workspace: Workspace,
): void {
  const text = JSON.stringify(workspaceSchema.parse(workspace));
  const previous = storage.getItem(STORAGE_KEY);
  // Preserve a recoverable valid revision before committing the new primary.
  if (previous) {
    parseWorkspace(previous);
    storage.setItem(BACKUP_KEY, previous);
  }
  storage.setItem(STORAGE_KEY, text);
}
