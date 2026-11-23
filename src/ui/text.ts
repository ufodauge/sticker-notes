import type { BackupError } from "../core/backup.ts";

export const BACKUP_ERROR_TEXT: Readonly<Record<BackupError, string>> = {
  "not-json": "バックアップのファイルではない",
  "not-backup": "バックアップのファイルではない",
  "newer-version": "新しい版のアプリで作ったファイル\nアプリを更新してから読み込む",
  "too-large": "ファイルが大きすぎる",
};
