"use client";

import type { ReactNode } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { NewMenuActions } from "@/components/drive/new-menu";
import styles from "@/components/drive/drive.module.css";

export default function UploadAreaMenu({ children, disabled, onFolder, onUpload, onFolderUpload }: { children: ReactNode; disabled: boolean; onFolder: () => void; onUpload: () => void; onFolderUpload?: () => void }) {
  return <ContextMenu>
    <ContextMenuTrigger asChild disabled={disabled} onContextMenu={event => {
      const target = event.target;
      if (!(target instanceof Element) || !event.currentTarget.contains(target) ||
          target.closest("[data-drive-item]") ||
          (!target.closest("thead") && target.closest("button, a, input, select, textarea, [role='dialog'], [role='menu']"))) {
        // Nested item menus and other controls keep their own behavior.
        event.preventDefault();
      }
    }}>
      <div className={styles.fileWorkspace}>{children}</div>
    </ContextMenuTrigger>
    <ContextMenuContent className={styles.newMenu}>
      <NewMenuActions context disabled={disabled} onFolder={onFolder} onUpload={onUpload} onFolderUpload={onFolderUpload} />
    </ContextMenuContent>
  </ContextMenu>;
}
