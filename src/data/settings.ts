import * as v from "valibot";
import { LocalDateSchema } from "../core/backup.ts";
import { SNS_KINDS } from "../core/sns.ts";

export const SETTINGS = {
  lastSns: v.object({ kind: v.picklist(SNS_KINDS), id: v.string() }),
  invitationShown: v.literal(true),
  backup: v.object({ receivedCount: v.pipe(v.number(), v.integer()), date: LocalDateSchema }),
};

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = v.InferOutput<(typeof SETTINGS)[K]>;
